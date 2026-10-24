# ESP32 AI RC Car — Safety Systems & Troubleshooting Matrix

## 1. Safety Systems Implementation

### 1. Emergency Stop Priority
- **Hardware & Software Precedence:** When `ACTION_ESTOP` is triggered via REST, WebSocket, or local safety fault, the ESP32 disables all four H-bridge gates (IN1-IN4 = LOW) and sets PWM duty cycles to 0 immediately.
- **Persistent Lock:** The car remains locked in `MOTION_ESTOP_LOCKED` state. All subsequent motion commands are rejected until an explicit `ACTION_ESTOP_RESET` is received.

### 2. Command Leasing (Deadman's Switch)
- Every movement command has an associated lease time (default `500 ms`).
- While a finger is held on the D-Pad or screen, the controller continuously renews the lease every 250 ms.
- If the finger is lifted, the app crashes, or Wi-Fi packets stop arriving, the lease expires within 500 ms and motors automatically coast to a complete stop.

### 3. Forward Ultrasonic Hazard Guard
- During forward motion in **any** mode, if the ultrasonic sensor measures an obstacle <= `safe_distance_cm` (default 18 cm), forward motion is blocked immediately.
- Invalid readings (distance <= 0 or > 400 cm) are **never treated as a clear path**; instead, they trigger an immediate obstacle halt until a stable reading returns.

### 4. Connection-Loss Watchdog
- If a client was connected via WebSocket and no packets are received for > 2000 ms, the firmware automatically halts motion and logs `FAULT_COMM_TIMEOUT`.

### 5. Hardware Task Watchdog (WDT)
- Configured with a 3-second timeout (`esp_task_wdt_init(3, true)`). If any task blocks or freezes the CPU loop, the ESP32 automatically reboots and re-arms in a safe STOP state.

---

## 2. Mandatory Bench Test Procedure (Wheels Elevated)

> [!IMPORTANT]
> **ALWAYS elevate the chassis so all four wheels spin freely in the air before testing power or firmware.** Never place the car on the floor during initial flashing or calibration.

1. **Power-On Test:**
   - Turn on battery switch. Verify LM2596 voltmeter reads between 5.0 V and 5.1 V before connecting to ESP32 VIN.
   - Observe ESP32 status LED: should blink steadily at 1 Hz.
2. **Direction Verification:**
   - Send `forward`: Both left and right wheels must rotate forward. If a side rotates backward, toggle `invert_left` or `invert_right` via `/api/config` or swap motor wires.
   - Send `reverse`: Both wheels rotate backward.
   - Send `left`: Right wheels forward, left wheels reverse.
   - Send `right`: Left wheels forward, right wheels reverse.
3. **Lease Timeout Test:**
   - Send a single `forward` command with `lease_ms: 400`.
   - Verify wheels stop spinning within ~400 ms without sending a stop command.
4. **Emergency Stop Test:**
   - While wheels are spinning, press the red Emergency Stop button. Verify wheels halt instantly and refuse subsequent movement commands until reset.
5. **Proximity Brake Test:**
   - Spin wheels forward, then place a notebook 10 cm in front of the HC-SR04. Verify wheels halt immediately due to ultrasonic collision guard.

---

## 3. Diagnostic & Troubleshooting Matrix

| Symptom | Probable Cause | Corrective Action |
| :--- | :--- | :--- |
| **ESP32 reboots when motors start** | Severe battery voltage sag or brownout | 1. Ensure 2S battery is charged (> 7.4V).<br>2. Power ESP32 from dedicated LM2596 buck converter, not from L298N 5V regulator.<br>3. Add a 470µF-1000µF capacitor across motor supply rails. |
| **Motors hum or whine but do not turn** | PWM duty cycle below motor friction deadband | Increase `min_speed` in config (e.g., from 40% to 55%). Ensure L298N ENA/ENB jumpers are removed. |
| **Distance reads 0 cm or failsafe triggers continuously** | HC-SR04 ECHO level shifter issue or wiring loose | 1. Check 1kΩ / 2kΩ voltage divider on GPIO 12.<br>2. Ensure sensor VCC is connected to 5.0V, not 3.3V.<br>3. Check trigger wire on GPIO 13. |
| **Microphone fails to detect keywords** | INMP441 L/R pin floating or ambient noise floor | 1. Connect INMP441 `L/R` pin firmly to GND (mono left channel).<br>2. Inspect `/api/diagnostics` for `mic_dma_errors`.<br>3. Check serial monitor for acoustic classification logs. |
| **Web Dashboard shows DISCONNECTED** | IP address mismatch or PC on different network | 1. Connect PC / phone to ESP32 Wi-Fi AP (`ESP32-AI-RC-Car`, pass: `esp32car123`).<br>2. Enter IP `192.168.4.1` in the dashboard header. |
| **L298N driver becomes extremely hot** | High current draw from 4 parallel motors | 1. Ensure aluminum heatsink is installed.<br>2. Avoid stalling wheels under heavy load.<br>3. Limit max speed in software to 80-90%. |
