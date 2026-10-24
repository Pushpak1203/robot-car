# ESP32 AI RC Car — Voice Command Recognition Architecture

## 1. Architectural Distinction

The project maintains a strict separation between two independent voice pipelines:

1. **On-Device Hardware Voice Processing:**
   - Microphone: **INMP441 I2S MEMS** connected directly to ESP32 (GPIO 18, 19, 21).
   - Execution: **Runs 100% locally on the ESP32 CPU (Core 0 / Core 1)** inside `firmware/esp32/src/main.cpp`.
   - Requires zero internet connection, zero cloud APIs, and zero external services.

2. **Controller-Side Speech Recognition (Web & Mobile):**
   - Web Dashboard: Uses the browser's native **Web Speech API** (`SpeechRecognition`).
   - Mobile App: Uses phone OS voice dictation / touch voice triggers.
   - Dispatches validated JSON command frames over WebSocket/REST to the car.

---

## 2. On-Device DSP Pipeline in `main.cpp`

The ESP32 firmware features an offline acoustic pattern recognition engine:

```text
[ INMP441 MEMS Mic ]
        │
        ▼ (I2S DMA @ 16 kHz, 32-bit slot, Mono)
[ I2S DMA Buffer (480 samples / 30 ms frame) ]
        │
        ▼
[ DC-Offset Removal & Normalization ]
        │
        ▼
[ Real-Time Feature Extraction ]
   ├── Short-Time RMS Energy Calculation
   ├── Zero-Crossing Rate (ZCR) Calculation
   └── Adaptive Noise Floor Tracker (Continuous ambient compensation)
        │
        ▼
[ Syllabic Burst Segmentation State Machine ]
   ├── Utterance Start Detection (Energy > Adaptive Threshold)
   ├── Burst Duration Measurement (ms)
   ├── Syllable Count Accumulator (Energy valleys between peaks)
   └── Average Zero-Crossing Density
        │
        ▼
[ Keyword Acoustic Classifier ]
   ├── "STOP"    : Fast burst (< 480ms), high ZCR (> 0.20) due to sibilant [s] and [t]
   ├── "FORWARD" : Dual-peak syllabic profile ("for-ward"), duration 450 - 850ms
   ├── "BACK"    : Single crisp syllable, low ZCR (< 0.16), duration 250 - 450ms
   ├── "LEFT"    : Single elongated vowel formant, medium ZCR, duration 250 - 600ms
   └── "RIGHT"   : Single rising energy transition, duration 300 - 700ms
        │
        ▼
[ Command Dispatch & Safety Verification ]
```

---

## 3. Extending to Edge Impulse / ESP-SR / TFLite Micro

If you wish to deploy a deep-learning neural network (e.g., 1D CNN or RNN Keyword Spotting) instead of the DSP heuristics:

1. **Model Training:**
   - Record 50-100 audio samples per keyword at 16 kHz mono.
   - Train a quantized INT8 Keyword Spotting model via Edge Impulse or TensorFlow Lite for Microcontrollers.
2. **Integration into `main.cpp`:**
   - Place the exported `tflite_model_data.h` weights array into `main.cpp` or compile with the ESP-NN library.
   - In Section 7 (`readAudioFrame`), feed the 16-bit PCM window directly into the TFLite input tensor buffer.
   - In Section 8 (`processVoiceCommands`), invoke `interpreter->Invoke()` and read class probability output.
