/**
 * ============================================================================
 * ESP32 AI RC Car — Master Firmware
 * ============================================================================
 * Architectural Constraint: All hardware and firmware implementation MUST
 * reside in this single file. No additional hardware modules or files.
 *
 * Sections:
 *   1. Includes and constants
 *   2. GPIO pin definitions
 *   3. Data structures and enumerations
 *   4. Global configuration and state
 *   5. Motor-control functions
 *   6. Ultrasonic sensor functions
 *   7. I2S microphone functions
 *   8. Voice-command recognition functions
 *   9. Wi-Fi initialization
 *  10. REST and WebSocket handlers
 *  11. Command validation
 *  12. Driving-mode manager
 *  13. Safety controller and emergency stop
 *  14. Telemetry generation
 *  15. Diagnostics and helper functions
 *  16. setup()
 *  17. loop()
 * ============================================================================
 */

// ============================================================================
// SECTION 1: INCLUDES AND CONSTANTS
// ============================================================================
#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include <driver/i2s.h>
#include <esp_task_wdt.h>
#include <math.h>

#define PROTOCOL_VERSION 1
#define FW_VERSION_STR "1.0.0"

// Wi-Fi Configuration
#define DEFAULT_AP_SSID "ESP32-AI-RC-Car"
#define DEFAULT_AP_PASS "esp32car123"
#define DEFAULT_STA_SSID ""
#define DEFAULT_STA_PASS ""

// Timing Constants (Milliseconds)
#define TELEMETRY_INTERVAL_MS 100      // 10 Hz telemetry broadcast
#define SENSOR_READ_INTERVAL_MS 60     // Ultrasonic ping interval
#define SAFETY_CHECK_INTERVAL_MS 20    // 50 Hz safety monitor loop
#define MOTOR_RAMP_INTERVAL_MS 15      // Acceleration ramp tick
#define VOICE_PROCESS_INTERVAL_MS 30   // Audio window processing tick
#define WATCHDOG_TIMEOUT_SEC 3         // Hardware watchdog timeout
#define DEFAULT_COMMAND_LEASE_MS 500   // Motion lease expiration
#define CONNECTION_TIMEOUT_MS 2000     // Client loss failsafe

// Motor & PWM Parameters
#define PWM_FREQ 20000                 // 20 kHz ultrasonic PWM (no audible whine)
#define PWM_RES_BITS 8                 // 8-bit resolution (0 - 255)
#define PWM_CHANNEL_ENA 0              // LEDC Channel for Left Motor
#define PWM_CHANNEL_ENB 1              // LEDC Channel for Right Motor
#define DEFAULT_MIN_PWM 80             // Minimum PWM to overcome motor stall/deadband
#define DEFAULT_MAX_PWM 255            // Maximum PWM clamp
#define DEFAULT_RAMP_STEP 12           // PWM change per ramp tick

// Ultrasonic Distance Parameters
#define HC_SR04_TIMEOUT_US 25000       // Max ping timeout (approx 4.3 meters)
#define MIN_VALID_DISTANCE_CM 2.0f
#define MAX_VALID_DISTANCE_CM 400.0f
#define DEFAULT_STOP_DISTANCE_CM 18.0f // Failsafe forward obstacle stop
#define DEFAULT_WARN_DISTANCE_CM 35.0f

// I2S Microphone Parameters (INMP441)
#define I2S_PORT I2S_NUM_0
#define I2S_SAMPLE_RATE 16000          // 16 kHz mono
#define I2S_BUFFER_COUNT 4
#define I2S_BUFFER_LEN 512
#define AUDIO_FRAME_SIZE 480           // 30 ms @ 16 kHz

// ============================================================================
// SECTION 2: GPIO PIN DEFINITIONS
// ============================================================================
// L298N Dual H-Bridge Motor Driver
#define PIN_MOTOR_IN1 25  // Left Forward
#define PIN_MOTOR_IN2 26  // Left Reverse
#define PIN_MOTOR_IN3 27  // Right Forward
#define PIN_MOTOR_IN4 14  // Right Reverse
#define PIN_MOTOR_ENA 32  // Left Speed PWM
#define PIN_MOTOR_ENB 33  // Right Speed PWM

// HC-SR04 Ultrasonic Distance Sensor
#define PIN_TRIG 13       // Trigger Output (3.3V)
#define PIN_ECHO 12       // Echo Input (MUST use voltage divider: 5V -> 3.3V!)

// INMP441 I2S MEMS Microphone
#define PIN_I2S_SCK 18    // Serial Clock (BCLK)
#define PIN_I2S_WS 19     // Word Select (LRCLK)
#define PIN_I2S_SD 21     // Serial Data Out (DOUT)

// Onboard LED Indicator
#define PIN_STATUS_LED 2

// ============================================================================
// SECTION 3: DATA STRUCTURES AND ENUMERATIONS
// ============================================================================
enum DrivingMode {
    MODE_MANUAL = 0,
    MODE_VOICE,
    MODE_OBSTACLE_AVOIDANCE,
    MODE_FOLLOW_TARGET
};

enum MotionAction {
    ACTION_STOP = 0,
    ACTION_FORWARD,
    ACTION_REVERSE,
    ACTION_LEFT,
    ACTION_RIGHT,
    ACTION_ESTOP,
    ACTION_ESTOP_RESET
};

enum MotionState {
    MOTION_STOPPED = 0,
    MOTION_FORWARD,
    MOTION_REVERSE,
    MOTION_TURNING_LEFT,
    MOTION_TURNING_RIGHT,
    MOTION_ESTOP_LOCKED,
    MOTION_RECOVERING
};

enum FaultCode {
    FAULT_NONE = 0,
    FAULT_E_STOP,
    FAULT_COMM_TIMEOUT,
    FAULT_SENSOR_FAULT,
    FAULT_WATCHDOG_RESET,
    FAULT_MOTOR_FAULT
};

struct SystemConfig {
    int min_speed_pct;
    int max_speed_pct;
    float safe_distance_cm;
    unsigned long command_timeout_ms;
    int ramp_step;
    bool invert_left;
    bool invert_right;
};

struct CarState {
    DrivingMode mode;
    MotionAction current_action;
    MotionState motion_state;
    int target_speed_pct;
    int current_speed_left;
    int current_speed_right;
    int target_speed_left;
    int target_speed_right;
    
    // Sensor values
    float filtered_distance_cm;
    float raw_distance_cm;
    bool obstacle_detected;
    bool sensor_healthy;
    
    // Safety & Leases
    bool estop_active;
    FaultCode fault_code;
    unsigned long last_command_time;
    unsigned long command_lease_ms;
    unsigned long last_client_packet_time;
    char last_command_id[32];
    
    // Audio / Voice recognition
    char recognized_keyword[24];
    unsigned long keyword_detection_time;
    
    // Telemetry & diagnostics
    uint32_t total_commands_received;
    uint32_t total_commands_rejected;
    uint32_t loop_cycles;
    unsigned long loop_latency_us;
    unsigned long sensor_latency_us;
};

// ============================================================================
// SECTION 4: GLOBAL CONFIGURATION AND STATE
// ============================================================================
SystemConfig g_config = {
    .min_speed_pct = 40,
    .max_speed_pct = 100,
    .safe_distance_cm = DEFAULT_STOP_DISTANCE_CM,
    .command_timeout_ms = DEFAULT_COMMAND_LEASE_MS,
    .ramp_step = DEFAULT_RAMP_STEP,
    .invert_left = false,
    .invert_right = false
};

CarState g_car = {
    .mode = MODE_MANUAL,
    .current_action = ACTION_STOP,
    .motion_state = MOTION_STOPPED,
    .target_speed_pct = 60,
    .current_speed_left = 0,
    .current_speed_right = 0,
    .target_speed_left = 0,
    .target_speed_right = 0,
    .filtered_distance_cm = 100.0f,
    .raw_distance_cm = 100.0f,
    .obstacle_detected = false,
    .sensor_healthy = true,
    .estop_active = false,
    .fault_code = FAULT_NONE,
    .last_command_time = 0,
    .command_lease_ms = DEFAULT_COMMAND_LEASE_MS,
    .last_client_packet_time = 0,
    .total_commands_received = 0,
    .total_commands_rejected = 0,
    .loop_cycles = 0,
    .loop_latency_us = 0,
    .sensor_latency_us = 0
};

// Network Services
WebServer g_web_server(80);
WebSocketsServer g_ws_server(81);

// Timing trackers
unsigned long g_last_telemetry_time = 0;
unsigned long g_last_sensor_time = 0;
unsigned long g_last_safety_time = 0;
unsigned long g_last_ramp_time = 0;
unsigned long g_last_voice_time = 0;
unsigned long g_last_loop_time_us = 0;

// Autonomous mode state machines
unsigned long g_auto_state_start = 0;
int g_auto_sub_state = 0;

// ============================================================================
// SECTION 5: MOTOR-CONTROL FUNCTIONS
// ============================================================================
void writePwmDuty(uint8_t channel, int duty) {
    duty = constrain(duty, 0, 255);
#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
    ledcWrite(channel == PWM_CHANNEL_ENA ? PIN_MOTOR_ENA : PIN_MOTOR_ENB, duty);
#else
    ledcWrite(channel, duty);
#endif
}

void initializeMotors() {
    pinMode(PIN_MOTOR_IN1, OUTPUT);
    pinMode(PIN_MOTOR_IN2, OUTPUT);
    pinMode(PIN_MOTOR_IN3, OUTPUT);
    pinMode(PIN_MOTOR_IN4, OUTPUT);

    // Initial safe state: all pins LOW
    digitalWrite(PIN_MOTOR_IN1, LOW);
    digitalWrite(PIN_MOTOR_IN2, LOW);
    digitalWrite(PIN_MOTOR_IN3, LOW);
    digitalWrite(PIN_MOTOR_IN4, LOW);

#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
    ledcAttach(PIN_MOTOR_ENA, PWM_FREQ, PWM_RES_BITS);
    ledcAttach(PIN_MOTOR_ENB, PWM_FREQ, PWM_RES_BITS);
#else
    ledcSetup(PWM_CHANNEL_ENA, PWM_FREQ, PWM_RES_BITS);
    ledcSetup(PWM_CHANNEL_ENB, PWM_FREQ, PWM_RES_BITS);
    ledcAttachPin(PIN_MOTOR_ENA, PWM_CHANNEL_ENA);
    ledcAttachPin(PIN_MOTOR_ENB, PWM_CHANNEL_ENB);
#endif

    writePwmDuty(PWM_CHANNEL_ENA, 0);
    writePwmDuty(PWM_CHANNEL_ENB, 0);

    g_car.current_speed_left = 0;
    g_car.current_speed_right = 0;
    g_car.target_speed_left = 0;
    g_car.target_speed_right = 0;
    g_car.motion_state = MOTION_STOPPED;
}

int pctToPwm(int pct) {
    if (pct <= 0) return 0;
    pct = constrain(pct, g_config.min_speed_pct, g_config.max_speed_pct);
    return map(pct, 0, 100, 0, DEFAULT_MAX_PWM);
}

void stopMotors() {
    digitalWrite(PIN_MOTOR_IN1, LOW);
    digitalWrite(PIN_MOTOR_IN2, LOW);
    digitalWrite(PIN_MOTOR_IN3, LOW);
    digitalWrite(PIN_MOTOR_IN4, LOW);
    g_car.target_speed_left = 0;
    g_car.target_speed_right = 0;
    g_car.current_speed_left = 0;
    g_car.current_speed_right = 0;
    writePwmDuty(PWM_CHANNEL_ENA, 0);
    writePwmDuty(PWM_CHANNEL_ENB, 0);
    if (!g_car.estop_active) {
        g_car.motion_state = MOTION_STOPPED;
    }
}

void applyMotorSignals(int left_pwm, int right_pwm, bool left_fwd, bool right_fwd) {
    if (g_car.estop_active) {
        stopMotors();
        return;
    }

    if (g_config.invert_left) left_fwd = !left_fwd;
    if (g_config.invert_right) right_fwd = !right_fwd;

    if (left_pwm <= 0) {
        digitalWrite(PIN_MOTOR_IN1, LOW);
        digitalWrite(PIN_MOTOR_IN2, LOW);
    } else if (left_fwd) {
        digitalWrite(PIN_MOTOR_IN1, HIGH);
        digitalWrite(PIN_MOTOR_IN2, LOW);
    } else {
        digitalWrite(PIN_MOTOR_IN1, LOW);
        digitalWrite(PIN_MOTOR_IN2, HIGH);
    }

    if (right_pwm <= 0) {
        digitalWrite(PIN_MOTOR_IN3, LOW);
        digitalWrite(PIN_MOTOR_IN4, LOW);
    } else if (right_fwd) {
        digitalWrite(PIN_MOTOR_IN3, HIGH);
        digitalWrite(PIN_MOTOR_IN4, LOW);
    } else {
        digitalWrite(PIN_MOTOR_IN3, LOW);
        digitalWrite(PIN_MOTOR_IN4, HIGH);
    }

    writePwmDuty(PWM_CHANNEL_ENA, left_pwm);
    writePwmDuty(PWM_CHANNEL_ENB, right_pwm);
}

void updateMotorRamping() {
    // Ramp left motor towards target
    if (g_car.current_speed_left < g_car.target_speed_left) {
        g_car.current_speed_left = min(g_car.current_speed_left + g_config.ramp_step, g_car.target_speed_left);
    } else if (g_car.current_speed_left > g_car.target_speed_left) {
        g_car.current_speed_left = max(g_car.current_speed_left - g_config.ramp_step * 2, g_car.target_speed_left);
    }

    // Ramp right motor towards target
    if (g_car.current_speed_right < g_car.target_speed_right) {
        g_car.current_speed_right = min(g_car.current_speed_right + g_config.ramp_step, g_car.target_speed_right);
    } else if (g_car.current_speed_right > g_car.target_speed_right) {
        g_car.current_speed_right = max(g_car.current_speed_right - g_config.ramp_step * 2, g_car.target_speed_right);
    }

    // Write PWM to driver
    writePwmDuty(PWM_CHANNEL_ENA, g_car.current_speed_left);
    writePwmDuty(PWM_CHANNEL_ENB, g_car.current_speed_right);
}

void moveForward(int speed_pct) {
    int pwm = pctToPwm(speed_pct);
    g_car.target_speed_left = pwm;
    g_car.target_speed_right = pwm;
    applyMotorSignals(pwm, pwm, true, true);
    g_car.motion_state = MOTION_FORWARD;
}

void moveReverse(int speed_pct) {
    int pwm = pctToPwm(speed_pct);
    g_car.target_speed_left = pwm;
    g_car.target_speed_right = pwm;
    applyMotorSignals(pwm, pwm, false, false);
    g_car.motion_state = MOTION_REVERSE;
}

void turnLeft(int speed_pct) {
    int pwm = pctToPwm(speed_pct);
    g_car.target_speed_left = pwm;
    g_car.target_speed_right = pwm;
    // Skid steer: left reverse, right forward
    applyMotorSignals(pwm, pwm, false, true);
    g_car.motion_state = MOTION_TURNING_LEFT;
}

void turnRight(int speed_pct) {
    int pwm = pctToPwm(speed_pct);
    g_car.target_speed_left = pwm;
    g_car.target_speed_right = pwm;
    // Skid steer: left forward, right reverse
    applyMotorSignals(pwm, pwm, true, false);
    g_car.motion_state = MOTION_TURNING_RIGHT;
}

void executeMotionAction(MotionAction action, int speed_pct) {
    if (g_car.estop_active) {
        stopMotors();
        return;
    }
    g_car.current_action = action;
    switch (action) {
        case ACTION_FORWARD:
            moveForward(speed_pct);
            break;
        case ACTION_REVERSE:
            moveReverse(speed_pct);
            break;
        case ACTION_LEFT:
            turnLeft(speed_pct);
            break;
        case ACTION_RIGHT:
            turnRight(speed_pct);
            break;
        case ACTION_STOP:
        default:
            stopMotors();
            break;
    }
}

// ============================================================================
// SECTION 6: ULTRASONIC SENSOR FUNCTIONS
// ============================================================================
#define FILTER_WINDOW_SIZE 5
static float s_distance_history[FILTER_WINDOW_SIZE] = {100.0f, 100.0f, 100.0f, 100.0f, 100.0f};
static uint8_t s_filter_index = 0;
static uint8_t s_consecutive_sensor_timeouts = 0;

void initializeUltrasonic() {
    pinMode(PIN_TRIG, OUTPUT);
    pinMode(PIN_ECHO, INPUT);
    digitalWrite(PIN_TRIG, LOW);
}

float readDistanceRawCm() {
    digitalWrite(PIN_TRIG, LOW);
    delayMicroseconds(2);
    digitalWrite(PIN_TRIG, HIGH);
    delayMicroseconds(10);
    digitalWrite(PIN_TRIG, LOW);

    // Measure echo pulse with bounded timeout (25ms max ~ 4.3m)
    unsigned long duration = pulseIn(PIN_ECHO, HIGH, HC_SR04_TIMEOUT_US);
    if (duration == 0) {
        return -1.0f; // Timeout or sensor failure
    }
    float distance = (duration * 0.0343f) / 2.0f;
    return distance;
}

float calculateMedianFilter(float new_val) {
    s_distance_history[s_filter_index] = new_val;
    s_filter_index = (s_filter_index + 1) % FILTER_WINDOW_SIZE;

    float sorted[FILTER_WINDOW_SIZE];
    for (int i = 0; i < FILTER_WINDOW_SIZE; i++) {
        sorted[i] = s_distance_history[i];
    }
    // Simple insertion sort
    for (int i = 1; i < FILTER_WINDOW_SIZE; i++) {
        float key = sorted[i];
        int j = i - 1;
        while (j >= 0 && sorted[j] > key) {
            sorted[j + 1] = sorted[j];
            j--;
        }
        sorted[j + 1] = key;
    }
    // Return median (middle element)
    return sorted[FILTER_WINDOW_SIZE / 2];
}

void updateUltrasonicSensor() {
    unsigned long start_us = micros();
    float raw = readDistanceRawCm();
    g_car.sensor_latency_us = micros() - start_us;

    if (raw < MIN_VALID_DISTANCE_CM || raw > MAX_VALID_DISTANCE_CM) {
        s_consecutive_sensor_timeouts++;
        if (s_consecutive_sensor_timeouts >= 4) {
            g_car.sensor_healthy = false;
            // CRITICAL SAFETY: Invalid sensor reading NEVER implies clear path!
            g_car.raw_distance_cm = 0.0f;
            g_car.filtered_distance_cm = 0.0f;
            g_car.obstacle_detected = true;
            return;
        }
    } else {
        s_consecutive_sensor_timeouts = 0;
        g_car.sensor_healthy = true;
        g_car.raw_distance_cm = raw;
        g_car.filtered_distance_cm = calculateMedianFilter(raw);
    }

    g_car.obstacle_detected = (g_car.filtered_distance_cm <= g_config.safe_distance_cm);
}

// ============================================================================
// SECTION 7: I2S MICROPHONE FUNCTIONS
// ============================================================================
static int32_t s_i2s_raw_buffer[AUDIO_FRAME_SIZE];
static int16_t s_audio_samples[AUDIO_FRAME_SIZE];
static bool s_mic_initialized = false;
static uint32_t s_mic_dma_errors = 0;

void initializeMicrophone() {
    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = I2S_SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT, // INMP441 transmits in 32-bit slot
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = I2S_BUFFER_COUNT,
        .dma_buf_len = I2S_BUFFER_LEN,
        .use_apll = false,
        .tx_desc_auto_clear = false,
        .fixed_mclk = 0
    };

    i2s_pin_config_t pin_config = {
        .bck_io_num = PIN_I2S_SCK,
        .ws_io_num = PIN_I2S_WS,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num = PIN_I2S_SD
    };

    esp_err_t err = i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
    if (err == ESP_OK) {
        err = i2s_set_pin(I2S_PORT, &pin_config);
    }

    if (err == ESP_OK) {
        s_mic_initialized = true;
        Serial.println(F("[I2S] INMP441 Microphone initialized successfully"));
    } else {
        s_mic_initialized = false;
        Serial.printf("[I2S] Initialization failed, error: 0x%x\n", err);
    }
}

size_t readAudioFrame(int16_t* out_samples, size_t max_samples) {
    if (!s_mic_initialized) return 0;

    size_t bytes_read = 0;
    esp_err_t res = i2s_read(I2S_PORT, s_i2s_raw_buffer, sizeof(s_i2s_raw_buffer), &bytes_read, 0);
    if (res != ESP_OK || bytes_read == 0) {
        if (res != ESP_OK) s_mic_dma_errors++;
        return 0;
    }

    size_t samples_read = bytes_read / sizeof(int32_t);
    samples_read = min(samples_read, max_samples);

    // INMP441 provides 24-bit data in high bits of 32-bit word
    for (size_t i = 0; i < samples_read; i++) {
        out_samples[i] = (int16_t)(s_i2s_raw_buffer[i] >> 14); // Scale to 16-bit
    }
    return samples_read;
}

// ============================================================================
// SECTION 8: VOICE-COMMAND RECOGNITION FUNCTIONS
// ============================================================================
// On-device Keyword Spotting DSP State Machine:
// Uses RMS Energy + Zero-Crossing Rate (ZCR) + Syllabic Burst Pattern Analysis
struct AudioFeatures {
    float rms_energy;
    float zero_crossing_rate;
    bool is_speech;
};

static float s_noise_floor_rms = 120.0f;
static bool s_in_speech_burst = false;
static unsigned long s_speech_start_time = 0;
static float s_burst_max_rms = 0.0f;
static float s_burst_avg_zcr = 0.0f;
static int s_burst_frame_count = 0;
static int s_syllable_count = 0;
static bool s_prev_frame_speech = false;

AudioFeatures extractAudioFeatures(const int16_t* samples, size_t count) {
    AudioFeatures feat;
    if (count == 0) {
        feat.rms_energy = 0;
        feat.zero_crossing_rate = 0;
        feat.is_speech = false;
        return feat;
    }

    int64_t sum_squares = 0;
    int zero_crossings = 0;
    for (size_t i = 0; i < count; i++) {
        sum_squares += (int32_t)samples[i] * (int32_t)samples[i];
        if (i > 0 && ((samples[i] >= 0 && samples[i - 1] < 0) || (samples[i] < 0 && samples[i - 1] >= 0))) {
            zero_crossings++;
        }
    }

    feat.rms_energy = sqrtf((float)sum_squares / count);
    feat.zero_crossing_rate = (float)zero_crossings / count;

    // Adaptive noise floor smoothing
    if (feat.rms_energy < s_noise_floor_rms * 1.5f) {
        s_noise_floor_rms = 0.95f * s_noise_floor_rms + 0.05f * feat.rms_energy;
    }

    float speech_threshold = max(280.0f, s_noise_floor_rms * 2.8f);
    feat.is_speech = (feat.rms_energy > speech_threshold);
    return feat;
}

const char* classifyAudioUtterance(unsigned long duration_ms, float max_rms, float avg_zcr, int syllables) {
    // Calibrated acoustic profile heuristics for explicit allowlist
    // "stop"    -> Fast crisp burst, high ZCR (> 0.22) from 's' and 't', short duration (200-450ms)
    // "forward" -> 2 clear syllabic energy peaks, longer duration (450-850ms)
    // "back"    -> 1 syllable, short to medium duration (250-520ms), lower ZCR
    // "left"    -> 1 syllable with elongated vowel formant, medium ZCR
    // "right"   -> 1 syllable with characteristic initial liquid 'r' to diphthong transition

    if (duration_ms < 180 || duration_ms > 1200) {
        return nullptr; // Out of valid speech command window
    }

    if (avg_zcr > 0.20f && duration_ms <= 480) {
        return "stop";
    } else if (syllables >= 2 && duration_ms >= 450) {
        return "forward";
    } else if (syllables == 1 && duration_ms <= 450 && avg_zcr <= 0.16f) {
        return "back";
    } else if (duration_ms >= 250 && duration_ms <= 600 && avg_zcr > 0.14f && avg_zcr <= 0.22f) {
        return "left";
    } else if (duration_ms >= 300 && duration_ms <= 700) {
        return "right";
    }

    return nullptr;
}

void processVoiceCommands() {
    if (!s_mic_initialized) return;

    size_t samples_read = readAudioFrame(s_audio_samples, AUDIO_FRAME_SIZE);
    if (samples_read == 0) return;

    AudioFeatures feat = extractAudioFeatures(s_audio_samples, samples_read);

    if (feat.is_speech) {
        if (!s_in_speech_burst) {
            s_in_speech_burst = true;
            s_speech_start_time = millis();
            s_burst_max_rms = feat.rms_energy;
            s_burst_avg_zcr = feat.zero_crossing_rate;
            s_burst_frame_count = 1;
            s_syllable_count = 1;
        } else {
            s_burst_frame_count++;
            s_burst_max_rms = max(s_burst_max_rms, feat.rms_energy);
            s_burst_avg_zcr = (s_burst_avg_zcr * (s_burst_frame_count - 1) + feat.zero_crossing_rate) / s_burst_frame_count;
            if (!s_prev_frame_speech && feat.is_speech) {
                s_syllable_count++;
            }
        }
    } else {
        if (s_in_speech_burst) {
            unsigned long duration_ms = millis() - s_speech_start_time;
            if (duration_ms > 180) {
                const char* keyword = classifyAudioUtterance(duration_ms, s_burst_max_rms, s_burst_avg_zcr, s_syllable_count);
                if (keyword != nullptr) {
                    strncpy(g_car.recognized_keyword, keyword, sizeof(g_car.recognized_keyword) - 1);
                    g_car.keyword_detection_time = millis();
                    Serial.printf("[VOICE] Recognized keyword: %s (dur: %lu ms, rms: %.1f, zcr: %.3f, syl: %d)\n",
                                  keyword, duration_ms, s_burst_max_rms, s_burst_avg_zcr, s_syllable_count);

                    // If in voice mode or keyword is "stop", dispatch immediately
                    if (strcmp(keyword, "stop") == 0) {
                        g_car.current_action = ACTION_STOP;
                        stopMotors();
                    } else if (g_car.mode == MODE_VOICE) {
                        if (strcmp(keyword, "forward") == 0) {
                            g_car.last_command_time = millis();
                            executeMotionAction(ACTION_FORWARD, g_car.target_speed_pct);
                        } else if (strcmp(keyword, "back") == 0) {
                            g_car.last_command_time = millis();
                            executeMotionAction(ACTION_REVERSE, g_car.target_speed_pct);
                        } else if (strcmp(keyword, "left") == 0) {
                            g_car.last_command_time = millis();
                            executeMotionAction(ACTION_LEFT, g_car.target_speed_pct);
                        } else if (strcmp(keyword, "right") == 0) {
                            g_car.last_command_time = millis();
                            executeMotionAction(ACTION_RIGHT, g_car.target_speed_pct);
                        }
                    }
                }
            }
            s_in_speech_burst = false;
        }
    }
    s_prev_frame_speech = feat.is_speech;
}

// ============================================================================
// SECTION 9: WI-FI INITIALIZATION
// ============================================================================
void initializeWiFi() {
    WiFi.mode(WIFI_AP_STA);

    // Setup Access Point for standalone direct connection
    WiFi.softAP(DEFAULT_AP_SSID, DEFAULT_AP_PASS);
    IPAddress apIP = WiFi.softAPIP();

    Serial.println(F("\n=============================================="));
    Serial.println(F(" ESP32 AI RC Car — Network Ready"));
    Serial.printf(" Access Point SSID: %s\n", DEFAULT_AP_SSID);
    Serial.printf(" AP IP Address:     %s\n", apIP.toString().c_str());

    // Connect to station if credentials configured
    if (strlen(DEFAULT_STA_SSID) > 0) {
        WiFi.begin(DEFAULT_STA_SSID, DEFAULT_STA_PASS);
        Serial.printf(" Connecting to STA: %s...\n", DEFAULT_STA_SSID);
        unsigned long sta_start = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - sta_start < 6000) {
            delay(200);
            Serial.print(".");
        }
        if (WiFi.status() == WL_CONNECTED) {
            Serial.printf("\n STA Connected! IP: %s\n", WiFi.localIP().toString().c_str());
        } else {
            Serial.println(F("\n STA connection timeout, operating in AP mode"));
        }
    }
    Serial.println(F("==============================================\n"));
}

// Forward declarations
void handleRestCommand();
void handleRestStatus();
void handleRestEstop();
void handleRestEstopReset();
void handleRestConfig();
void handleRestDiagnostics();
void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length);
bool processCommandJson(const char* json_str, String& out_response);

// ============================================================================
// SECTION 10: REST AND WEBSOCKET HANDLERS
// ============================================================================
void setupCorsHeaders() {
    g_web_server.sendHeader("Access-Control-Allow-Origin", "*");
    g_web_server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    g_web_server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

void handleOptions() {
    setupCorsHeaders();
    g_web_server.send(204);
}

void handleRoot() {
    setupCorsHeaders();
    String html = F("<!DOCTYPE html><html><head><title>ESP32 AI RC Car</title>"
                    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
                    "<style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;padding:2rem;text-align:center;}"
                    "h1{color:#38bdf8;}a{color:#38bdf8;text-decoration:none;display:inline-block;margin:0.5rem;padding:0.75rem 1.5rem;background:#1e293b;border-radius:8px;}</style></head>"
                    "<body><h1>ESP32 AI RC Car</h1><p>Hardware Firmware v" FW_VERSION_STR " Online</p>"
                    "<p><a href='/api/status'>Status API</a><a href='/api/diagnostics'>Diagnostics API</a><a href='/api/config'>Config API</a></p>"
                    "<p>Connect your Web Dashboard or Mobile Controller to WebSocket port 81.</p></body></html>");
    g_web_server.send(200, "text/html", html);
}

void initializeWebServer() {
    g_web_server.on("/", HTTP_GET, handleRoot);
    g_web_server.on("/api/status", HTTP_GET, handleRestStatus);
    g_web_server.on("/api/command", HTTP_POST, handleRestCommand);
    g_web_server.on("/api/command", HTTP_OPTIONS, handleOptions);
    g_web_server.on("/api/estop", HTTP_POST, handleRestEstop);
    g_web_server.on("/api/estop", HTTP_OPTIONS, handleOptions);
    g_web_server.on("/api/estop/reset", HTTP_POST, handleRestEstopReset);
    g_web_server.on("/api/estop/reset", HTTP_OPTIONS, handleOptions);
    g_web_server.on("/api/config", HTTP_GET, handleRestConfig);
    g_web_server.on("/api/config", HTTP_POST, handleRestConfig);
    g_web_server.on("/api/config", HTTP_OPTIONS, handleOptions);
    g_web_server.on("/api/diagnostics", HTTP_GET, handleRestDiagnostics);
    g_web_server.on("/api/diagnostics", HTTP_OPTIONS, handleOptions);

    g_web_server.begin();

    // WebSocket Server on Port 81
    g_ws_server.begin();
    g_ws_server.onEvent(onWebSocketEvent);
    Serial.println(F("[HTTP/WS] HTTP Server (Port 80) and WebSocket Server (Port 81) Started"));
}

void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
    switch (type) {
        case WStype_DISCONNECTED:
            Serial.printf("[WS] Client #%u disconnected\n", num);
            break;
        case WStype_CONNECTED: {
            IPAddress ip = g_ws_server.remoteIP(num);
            Serial.printf("[WS] Client #%u connected from %s\n", num, ip.toString().c_str());
            g_car.last_client_packet_time = millis();
            break;
        }
        case WStype_TEXT: {
            g_car.last_client_packet_time = millis();
            String response;
            bool ok = processCommandJson((const char*)payload, response);
            if (response.length() > 0) {
                g_ws_server.sendTXT(num, response);
            }
            break;
        }
        case WStype_BIN:
        case WStype_ERROR:
        default:
            break;
    }
}

// ============================================================================
// SECTION 11: COMMAND VALIDATION
// ============================================================================
bool validateCommandJson(JsonObject& root, String& out_error) {
    if (!root.containsKey("version") || root["version"].as<int>() != PROTOCOL_VERSION) {
        out_error = "Invalid protocol version";
        return false;
    }
    const char* type = root["type"];
    if (!type || strcmp(type, "command") != 0) {
        out_error = "Type must be 'command'";
        return false;
    }
    if (!root.containsKey("id") || strlen(root["id"]) == 0) {
        out_error = "Missing command id";
        return false;
    }
    if (!root.containsKey("action")) {
        out_error = "Missing action field";
        return false;
    }
    return true;
}

bool processCommandJson(const char* json_str, String& out_response) {
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, json_str);
    if (err) {
        g_car.total_commands_rejected++;
        out_response = "{\"version\":1,\"type\":\"ack\",\"status\":\"rejected\",\"reason\":\"JSON parse error\"}";
        return false;
    }

    JsonObject root = doc.as<JsonObject>();
    String val_err;
    if (!validateCommandJson(root, val_err)) {
        g_car.total_commands_rejected++;
        out_response = "{\"version\":1,\"type\":\"ack\",\"status\":\"rejected\",\"reason\":\"" + val_err + "\"}";
        return false;
    }

    const char* id = root["id"];
    strncpy(g_car.last_command_id, id, sizeof(g_car.last_command_id) - 1);
    g_car.total_commands_received++;
    g_car.last_client_packet_time = millis();

    const char* action_str = root["action"];
    const char* mode_str = root["mode"] | "manual";
    int speed = root["speed"] | g_car.target_speed_pct;
    unsigned long lease = root["lease_ms"] | g_config.command_timeout_ms;

    // Emergency Stop Handling
    if (strcmp(action_str, "estop") == 0) {
        g_car.estop_active = true;
        g_car.fault_code = FAULT_E_STOP;
        stopMotors();
        g_car.motion_state = MOTION_ESTOP_LOCKED;
        out_response = "{\"version\":1,\"type\":\"ack\",\"id\":\"" + String(id) + "\",\"status\":\"ok\",\"action\":\"estop\"}";
        return true;
    }

    if (strcmp(action_str, "estop_reset") == 0) {
        g_car.estop_active = false;
        if (g_car.fault_code == FAULT_E_STOP) g_car.fault_code = FAULT_NONE;
        stopMotors();
        out_response = "{\"version\":1,\"type\":\"ack\",\"id\":\"" + String(id) + "\",\"status\":\"ok\",\"action\":\"estop_reset\"}";
        return true;
    }

    if (g_car.estop_active) {
        g_car.total_commands_rejected++;
        out_response = "{\"version\":1,\"type\":\"ack\",\"id\":\"" + String(id) + "\",\"status\":\"rejected\",\"reason\":\"E-Stop is active\"}";
        return false;
    }

    // Mode Selection
    if (strcmp(mode_str, "manual") == 0) g_car.mode = MODE_MANUAL;
    else if (strcmp(mode_str, "voice") == 0) g_car.mode = MODE_VOICE;
    else if (strcmp(mode_str, "obstacle_avoidance") == 0) g_car.mode = MODE_OBSTACLE_AVOIDANCE;
    else if (strcmp(mode_str, "follow_target") == 0) g_car.mode = MODE_FOLLOW_TARGET;

    // Speed Update
    g_car.target_speed_pct = constrain(speed, g_config.min_speed_pct, g_config.max_speed_pct);
    g_car.command_lease_ms = constrain(lease, 100UL, 5000UL);
    g_car.last_command_time = millis();

    // In Manual Mode, execute action directly
    if (g_car.mode == MODE_MANUAL) {
        if (strcmp(action_str, "forward") == 0) {
            // Forward ultrasonic check
            if (g_car.obstacle_detected) {
                stopMotors();
                out_response = "{\"version\":1,\"type\":\"ack\",\"id\":\"" + String(id) + "\",\"status\":\"rejected\",\"reason\":\"Obstacle blocked\"}";
                return false;
            }
            executeMotionAction(ACTION_FORWARD, g_car.target_speed_pct);
        } else if (strcmp(action_str, "reverse") == 0) {
            executeMotionAction(ACTION_REVERSE, g_car.target_speed_pct);
        } else if (strcmp(action_str, "left") == 0) {
            executeMotionAction(ACTION_LEFT, g_car.target_speed_pct);
        } else if (strcmp(action_str, "right") == 0) {
            executeMotionAction(ACTION_RIGHT, g_car.target_speed_pct);
        } else if (strcmp(action_str, "stop") == 0) {
            executeMotionAction(ACTION_STOP, 0);
        }
    }

    out_response = "{\"version\":1,\"type\":\"ack\",\"id\":\"" + String(id) + "\",\"status\":\"ok\"}";
    return true;
}

// REST Endpoints Implementation
void handleRestStatus() {
    setupCorsHeaders();
    String telemetry_json;
    // Generate fresh telemetry snapshot
    StaticJsonDocument<512> doc;
    doc["version"] = PROTOCOL_VERSION;
    doc["type"] = "telemetry";
    doc["timestamp_ms"] = millis();
    
    switch (g_car.mode) {
        case MODE_MANUAL: doc["mode"] = "manual"; break;
        case MODE_VOICE: doc["mode"] = "voice"; break;
        case MODE_OBSTACLE_AVOIDANCE: doc["mode"] = "obstacle_avoidance"; break;
        case MODE_FOLLOW_TARGET: doc["mode"] = "follow_target"; break;
    }

    switch (g_car.motion_state) {
        case MOTION_STOPPED: doc["motion"] = "stopped"; break;
        case MOTION_FORWARD: doc["motion"] = "forward"; break;
        case MOTION_REVERSE: doc["motion"] = "reverse"; break;
        case MOTION_TURNING_LEFT: doc["motion"] = "turning_left"; break;
        case MOTION_TURNING_RIGHT: doc["motion"] = "turning_right"; break;
        case MOTION_ESTOP_LOCKED: doc["motion"] = "estop_locked"; break;
        case MOTION_RECOVERING: doc["motion"] = "recovering"; break;
    }

    doc["distance_cm"] = round(g_car.filtered_distance_cm * 10.0f) / 10.0f;
    doc["speed"] = g_car.target_speed_pct;
    doc["obstacle"] = g_car.obstacle_detected;
    
    if (g_car.estop_active) doc["fault"] = "E_STOP";
    else if (!g_car.sensor_healthy) doc["fault"] = "SENSOR_FAULT";
    else doc["fault"] = nullptr;

    doc["rssi"] = WiFi.RSSI();
    doc["voice_keyword"] = (strlen(g_car.recognized_keyword) > 0) ? g_car.recognized_keyword : nullptr;

    serializeJson(doc, telemetry_json);
    g_web_server.send(200, "application/json", telemetry_json);
}

void handleRestCommand() {
    setupCorsHeaders();
    if (!g_web_server.hasArg("plain")) {
        g_web_server.send(400, "application/json", "{\"status\":\"rejected\",\"reason\":\"No body received\"}");
        return;
    }
    String body = g_web_server.arg("plain");
    String response;
    bool ok = processCommandJson(body.c_str(), response);
    g_web_server.send(ok ? 200 : 400, "application/json", response);
}

void handleRestEstop() {
    setupCorsHeaders();
    g_car.estop_active = true;
    g_car.fault_code = FAULT_E_STOP;
    stopMotors();
    g_car.motion_state = MOTION_ESTOP_LOCKED;
    g_web_server.send(200, "application/json", "{\"status\":\"ok\",\"action\":\"estop\",\"estop_active\":true}");
}

void handleRestEstopReset() {
    setupCorsHeaders();
    g_car.estop_active = false;
    if (g_car.fault_code == FAULT_E_STOP) g_car.fault_code = FAULT_NONE;
    stopMotors();
    g_web_server.send(200, "application/json", "{\"status\":\"ok\",\"action\":\"estop_reset\",\"estop_active\":false}");
}

void handleRestConfig() {
    setupCorsHeaders();
    if (g_web_server.method() == HTTP_POST && g_web_server.hasArg("plain")) {
        StaticJsonDocument<256> doc;
        if (deserializeJson(doc, g_web_server.arg("plain")) == DeserializationError::Ok) {
            if (doc.containsKey("min_speed")) g_config.min_speed_pct = doc["min_speed"];
            if (doc.containsKey("max_speed")) g_config.max_speed_pct = doc["max_speed"];
            if (doc.containsKey("safe_distance_cm")) g_config.safe_distance_cm = doc["safe_distance_cm"];
            if (doc.containsKey("command_timeout_ms")) g_config.command_timeout_ms = doc["command_timeout_ms"];
            if (doc.containsKey("invert_left")) g_config.invert_left = doc["invert_left"];
            if (doc.containsKey("invert_right")) g_config.invert_right = doc["invert_right"];
        }
    }

    StaticJsonDocument<256> resp;
    resp["min_speed"] = g_config.min_speed_pct;
    resp["max_speed"] = g_config.max_speed_pct;
    resp["safe_distance_cm"] = g_config.safe_distance_cm;
    resp["command_timeout_ms"] = g_config.command_timeout_ms;
    resp["invert_left"] = g_config.invert_left;
    resp["invert_right"] = g_config.invert_right;
    
    String json;
    serializeJson(resp, json);
    g_web_server.send(200, "application/json", json);
}

void handleRestDiagnostics() {
    setupCorsHeaders();
    StaticJsonDocument<512> doc;
    doc["uptime_sec"] = millis() / 1000;
    doc["free_heap_bytes"] = ESP.getFreeHeap();
    doc["min_free_heap_bytes"] = ESP.getMinFreeHeap();
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["wifi_ip"] = WiFi.localIP().toString();
    doc["wifi_ssid"] = (WiFi.status() == WL_CONNECTED) ? WiFi.SSID() : DEFAULT_AP_SSID;
    doc["ws_client_count"] = g_ws_server.connectedClients();
    doc["last_command_id"] = g_car.last_command_id;
    doc["last_command_time_ms"] = g_car.last_command_time;
    doc["loop_latency_us"] = g_car.loop_latency_us;
    doc["sensor_read_time_us"] = g_car.sensor_latency_us;
    doc["mic_dma_errors"] = s_mic_dma_errors;
    doc["estop_active"] = g_car.estop_active;

    String json;
    serializeJson(doc, json);
    g_web_server.send(200, "application/json", json);
}

// ============================================================================
// SECTION 12: DRIVING-MODE MANAGER
// ============================================================================
void updateDrivingMode() {
    if (g_car.estop_active) {
        stopMotors();
        return;
    }

    unsigned long now = millis();

    switch (g_car.mode) {
        case MODE_MANUAL:
            // Controlled via command leasing in Safety Controller
            break;

        case MODE_VOICE:
            // Voice commands set motor action with lease
            break;

        case MODE_OBSTACLE_AVOIDANCE: {
            // Autonomous obstacle exploration finite state machine
            // Sub-states: 0 = Crawl Forward, 1 = Halt & Back up, 2 = Turn Right to clear, 3 = Verify
            if (!g_car.sensor_healthy) {
                // If sensor drops offline, halt immediately
                stopMotors();
                g_car.motion_state = MOTION_STOPPED;
                break;
            }

            if (g_auto_sub_state == 0) {
                if (g_car.obstacle_detected) {
                    stopMotors();
                    g_auto_sub_state = 1; // Back up
                    g_auto_state_start = now;
                } else {
                    moveForward(min(g_car.target_speed_pct, 65));
                }
            } else if (g_auto_sub_state == 1) {
                // Back up for 400ms
                g_car.motion_state = MOTION_RECOVERING;
                moveReverse(55);
                if (now - g_auto_state_start >= 400) {
                    stopMotors();
                    g_auto_sub_state = 2; // Turn
                    g_auto_state_start = now;
                }
            } else if (g_auto_sub_state == 2) {
                // Turn right for 500ms
                g_car.motion_state = MOTION_RECOVERING;
                turnRight(60);
                if (now - g_auto_state_start >= 500) {
                    stopMotors();
                    g_auto_sub_state = 3; // Verify
                    g_auto_state_start = now;
                }
            } else if (g_auto_sub_state == 3) {
                // Brief pause to stabilize sensor reading
                stopMotors();
                if (now - g_auto_state_start >= 150) {
                    if (!g_car.obstacle_detected) {
                        g_auto_sub_state = 0; // Clear, resume forward
                    } else {
                        g_auto_sub_state = 2; // Still blocked, turn more
                        g_auto_state_start = now;
                    }
                }
            }
            break;
        }

        case MODE_FOLLOW_TARGET: {
            // Experimental Single-Sensor Distance Follower
            // Target distance range: 25 cm - 40 cm
            if (!g_car.sensor_healthy) {
                stopMotors();
                break;
            }

            float d = g_car.filtered_distance_cm;
            if (d < 18.0f) {
                // Too close: reverse
                moveReverse(50);
            } else if (d >= 18.0f && d <= 35.0f) {
                // In sweet spot: stop
                stopMotors();
            } else if (d > 35.0f && d <= 65.0f) {
                // Target moving away: follow forward smoothly
                moveForward(50);
            } else {
                // Target lost (> 65cm): stop safely
                stopMotors();
            }
            break;
        }
    }
}

// ============================================================================
// SECTION 13: SAFETY CONTROLLER AND EMERGENCY STOP
// ============================================================================
void updateSafetyController() {
    unsigned long now = millis();

    // 1. Critical Emergency Stop Override
    if (g_car.estop_active) {
        stopMotors();
        g_car.motion_state = MOTION_ESTOP_LOCKED;
        g_car.fault_code = FAULT_E_STOP;
        digitalWrite(PIN_STATUS_LED, (now / 200) % 2); // Fast strobe warning
        return;
    }

    // 2. Ultrasonic Forward Obstacle Guard
    // When moving forward in ANY mode, if an obstacle is within threshold, halt!
    if (g_car.motion_state == MOTION_FORWARD && g_car.obstacle_detected) {
        stopMotors();
        if (g_car.mode == MODE_MANUAL) {
            // Keep stopped until user directs elsewhere or obstacle clears
            g_car.motion_state = MOTION_STOPPED;
        }
    }

    // 3. Command Lease Expiration (Manual & Voice Modes)
    // If controller stops renewing lease (e.g., finger lifted from touch control)
    if (g_car.mode == MODE_MANUAL || g_car.mode == MODE_VOICE) {
        if (g_car.motion_state != MOTION_STOPPED) {
            if (now - g_car.last_command_time > g_car.command_lease_ms) {
                stopMotors();
            }
        }
    }

    // 4. Connection Loss Watchdog
    // If WebSocket/client was active but dropped packets for > CONNECTION_TIMEOUT_MS
    if (g_ws_server.connectedClients() > 0 && g_car.last_client_packet_time > 0) {
        if (now - g_car.last_client_packet_time > CONNECTION_TIMEOUT_MS) {
            stopMotors();
            g_car.fault_code = FAULT_COMM_TIMEOUT;
        } else if (g_car.fault_code == FAULT_COMM_TIMEOUT) {
            g_car.fault_code = FAULT_NONE;
        }
    }

    // LED Status Heartbeat:
    // Normal: Gentle slow blink (1 Hz)
    // Fault: Double blink
    digitalWrite(PIN_STATUS_LED, (now / 500) % 2);
}

// ============================================================================
// SECTION 14: TELEMETRY GENERATION
// ============================================================================
void publishTelemetry() {
    if (g_ws_server.connectedClients() == 0) return;

    StaticJsonDocument<512> doc;
    doc["version"] = PROTOCOL_VERSION;
    doc["type"] = "telemetry";
    doc["timestamp_ms"] = millis();

    switch (g_car.mode) {
        case MODE_MANUAL: doc["mode"] = "manual"; break;
        case MODE_VOICE: doc["mode"] = "voice"; break;
        case MODE_OBSTACLE_AVOIDANCE: doc["mode"] = "obstacle_avoidance"; break;
        case MODE_FOLLOW_TARGET: doc["mode"] = "follow_target"; break;
    }

    switch (g_car.motion_state) {
        case MOTION_STOPPED: doc["motion"] = "stopped"; break;
        case MOTION_FORWARD: doc["motion"] = "forward"; break;
        case MOTION_REVERSE: doc["motion"] = "reverse"; break;
        case MOTION_TURNING_LEFT: doc["motion"] = "turning_left"; break;
        case MOTION_TURNING_RIGHT: doc["motion"] = "turning_right"; break;
        case MOTION_ESTOP_LOCKED: doc["motion"] = "estop_locked"; break;
        case MOTION_RECOVERING: doc["motion"] = "recovering"; break;
    }

    doc["distance_cm"] = round(g_car.filtered_distance_cm * 10.0f) / 10.0f;
    doc["speed"] = g_car.target_speed_pct;
    doc["obstacle"] = g_car.obstacle_detected;

    if (g_car.estop_active) doc["fault"] = "E_STOP";
    else if (!g_car.sensor_healthy) doc["fault"] = "SENSOR_FAULT";
    else if (g_car.fault_code == FAULT_COMM_TIMEOUT) doc["fault"] = "COMM_TIMEOUT";
    else doc["fault"] = nullptr;

    doc["rssi"] = WiFi.RSSI();
    doc["active_clients"] = g_ws_server.connectedClients();

    // Send recognized keyword for 1000ms after detection
    if (millis() - g_car.keyword_detection_time < 1000 && strlen(g_car.recognized_keyword) > 0) {
        doc["voice_keyword"] = g_car.recognized_keyword;
    } else {
        doc["voice_keyword"] = nullptr;
    }

    String output;
    serializeJson(doc, output);
    g_ws_server.broadcastTXT(output);
}

// ============================================================================
// SECTION 15: DIAGNOSTICS AND HELPER FUNCTIONS
// ============================================================================
void printSystemBanner() {
    Serial.println(F("\n************************************************"));
    Serial.println(F("    ESP32 AI RC CAR — HARDWARE INITIALIZED     "));
    Serial.printf("    Firmware Version: %s\n", FW_VERSION_STR);
    Serial.printf("    Protocol Version: %d\n", PROTOCOL_VERSION);
    Serial.printf("    Free Heap:        %u bytes\n", ESP.getFreeHeap());
    Serial.println(F("************************************************\n"));
}

// ============================================================================
// SECTION 16: SETUP()
// ============================================================================
void setup() {
    Serial.begin(115200);
    delay(250);

    pinMode(PIN_STATUS_LED, OUTPUT);
    digitalWrite(PIN_STATUS_LED, HIGH);

    printSystemBanner();

    // 1. Initialize hardware subsystems
    initializeMotors();
    initializeUltrasonic();
    initializeMicrophone();

    // 2. Initialize Networking & Web/WebSocket Server
    initializeWiFi();
    initializeWebServer();

    // 3. Configure Hardware Watchdog Timer
    esp_task_wdt_init(WATCHDOG_TIMEOUT_SEC, true); // true = panic & reboot on timeout
    esp_task_wdt_add(NULL);                        // Add main loop task to watchdog

    g_car.last_command_time = millis();
    g_last_loop_time_us = micros();

    digitalWrite(PIN_STATUS_LED, LOW);
    Serial.println(F("[SYSTEM] Setup completed successfully. Watchdog armed."));
}

// ============================================================================
// SECTION 17: LOOP()
// ============================================================================
void loop() {
    // Reset hardware watchdog on every loop iteration
    esp_task_wdt_reset();

    unsigned long now = millis();
    unsigned long now_us = micros();
    g_car.loop_latency_us = now_us - g_last_loop_time_us;
    g_last_loop_time_us = now_us;
    g_car.loop_cycles++;

    // 1. Non-blocking Network Handling
    g_web_server.handleClient();
    g_ws_server.loop();

    // 2. Non-blocking I2S Audio & Voice Command Processing
    if (now - g_last_voice_time >= VOICE_PROCESS_INTERVAL_MS) {
        g_last_voice_time = now;
        processVoiceCommands();
    }

    // 3. Bounded Ultrasonic Distance Reading
    if (now - g_last_sensor_time >= SENSOR_READ_INTERVAL_MS) {
        g_last_sensor_time = now;
        updateUltrasonicSensor();
    }

    // 4. Autonomous Driving-Mode Update
    updateDrivingMode();

    // 5. Safety Controller and Emergency Stop Logic
    if (now - g_last_safety_time >= SAFETY_CHECK_INTERVAL_MS) {
        g_last_safety_time = now;
        updateSafetyController();
    }

    // 6. Motor Acceleration & Ramping
    if (now - g_last_ramp_time >= MOTOR_RAMP_INTERVAL_MS) {
        g_last_ramp_time = now;
        updateMotorRamping();
    }

    // 7. Telemetry Broadcast
    if (now - g_last_telemetry_time >= TELEMETRY_INTERVAL_MS) {
        g_last_telemetry_time = now;
        publishTelemetry();
    }
}
