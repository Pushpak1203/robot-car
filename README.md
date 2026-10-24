# ESP32 AI RC Car — Mobile Controller, Web Dashboard and Voice Control

An end-to-end robotics project combining ESP32 dual-core firmware, an offline on-device I2S keyword-spotting audio DSP engine, a high-frequency WebSocket and REST telemetry server, a high-performance React/Vite mission control web dashboard, and an Expo/React Native mobile controller app with EAS Build Android APK generation.

---

## 1. Architectural Mandate: Single Hardware Code File

> [!IMPORTANT]
> **Strict Architectural Constraint:**  
> All ESP32 hardware and firmware logic is implemented exclusively in a single file:  
> [`firmware/esp32/src/main.cpp`](file:///firmware/esp32/src/main.cpp).  
> No additional hardware implementation modules (such as `motor_driver.cpp`, `ultrasonic.cpp`, `voice.cpp`, etc.) exist in the firmware project. External Arduino libraries (`ArduinoJson`, `WebSocketsServer`) and standard headers are utilized as external dependencies.

The 17 strictly ordered sections in `main.cpp`:
1. **Includes and constants**
2. **GPIO pin definitions**
3. **Data structures and enumerations**
4. **Global configuration and state**
5. **Motor-control functions** (20 kHz PWM, skid steering, acceleration ramping)
6. **Ultrasonic sensor functions** (Bounded pulse measurement, median filter)
7. **I2S microphone functions** (INMP441 DMA receiver @ 16 kHz)
8. **Voice-command recognition functions** (Acoustic energy & ZCR state machine)
9. **Wi-Fi initialization** (SoftAP `ESP32-AI-RC-Car` + Station mode)
10. **REST and WebSocket handlers** (HTTP port 80, WS port 81)
11. **Command validation** (Protocol v1 schema checks & error handling)
12. **Driving-mode manager** (Manual, Voice, Obstacle Avoidance, Target Follower)
13. **Safety controller and emergency stop** (Hardware E-Stop latch, command leases)
14. **Telemetry generation** (10 Hz broadcast)
15. **Diagnostics and helper functions** (Loop latency, heap tracking, WDT)
16. **`setup()`**
17. **`loop()`**

---

## 2. Monorepo Repository Structure

```text
ESP32-AI-RC-Car/
├── firmware/
│   └── esp32/
│       ├── platformio.ini              # PlatformIO board & dependency manifest
│       └── src/
│           └── main.cpp                # EXCLUSIVE hardware & firmware file
├── apps/
│   ├── mobile/                         # React Native / Expo Android app
│   │   ├── app/
│   │   │   ├── _layout.tsx             # Root layout with dark HUD theme
│   │   │   └── index.tsx               # Main mobile controller screen
│   │   ├── components/                 # D-Pad, E-Stop, Telemetry, Mode, Speed
│   │   ├── services/                   # Direct WebSocket & REST client
│   │   ├── types/
│   │   ├── app.json                    # Android package: com.esp32car.controller
│   │   ├── eas.json                    # EAS Build APK profile configuration
│   │   └── package.json
│   └── web/                            # React 18 + Vite 5 mission control dashboard
│       ├── src/
│       │   ├── components/             # Radar, Telemetry HUD, Controls, Voice
│       │   ├── services/               # CarClient WebSocket & REST engine
│       │   ├── App.tsx
│       │   ├── App.css
│       │   ├── index.css               # Futuristic cyberpunk / robotics design system
│       │   └── main.tsx
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── packages/
│   └── protocol/                       # Shared typed schema and validators
│       ├── src/
│       │   ├── types.ts                # TypeScript commands & telemetry types
│       │   ├── validator.ts            # Runtime command validation & sanitization
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── docs/
│   ├── wiring_diagram.md               # Electrical schematic, pinouts, level shifter
│   ├── protocol_spec.md                # REST & WebSocket protocol specification
│   ├── voice_control_guide.md          # On-device DSP vs controller speech pipelines
│   └── safety_and_troubleshooting.md   # Bench testing & fault recovery matrix
├── tests/
│   ├── protocol.test.ts                # Node.js automated protocol unit tests
│   └── firmware_sim_test.py            # Python firmware logic & safety simulation
├── package.json                        # Monorepo workspaces manifest
└── README.md
```

---

## 3. Hardware Specifications & Electrical Requirements

### L298N Dual H-Bridge Motor Driver
- **Left Motors Channel A:** IN1 (GPIO 25), IN2 (GPIO 26), ENA (GPIO 32, PWM)
- **Right Motors Channel B:** IN3 (GPIO 27), IN4 (GPIO 14), ENB (GPIO 33, PWM)
- **PWM Frequency:** 20,000 Hz (ultrasonic, eliminates motor whine)
- **Current Limits & Thermal Warning:**  
  The L298N has a high internal voltage drop ($V_{CE(sat)} \approx 1.8\text{V} - 3.2\text{V}$). Four standard DC gear motors connected in 2-parallel pairs can draw **1.6 A to 2.4 A stall current per channel**. Continuous stall will overheat the L298N. An aluminum heatsink is required, and firmware acceleration ramping is enabled to prevent severe current spikes.

### HC-SR04 Ultrasonic Distance Sensor
- **TRIG (Trigger):** GPIO 13 (Output from ESP32)
- **ECHO:** GPIO 12 (Input to ESP32)
- **Level Shifter / Voltage Divider:**  
  The HC-SR04 ECHO pulse is 5.0 V. ESP32 pins are **not 5V tolerant**. A voltage divider (1.0 kΩ from ECHO to GPIO 12, and 2.0 kΩ from GPIO 12 to GND) drops the signal to a safe 3.33 V.

### INMP441 I2S MEMS Microphone
- **SCK (Serial Clock):** GPIO 18
- **WS (Word Select):** GPIO 19
- **SD (Serial Data):** GPIO 21
- **L/R Pin:** Tied to GND (Left Channel Audio)
- **Sample Rate:** 16,000 Hz, 32-bit slot, Mono DMA receiver.

### Power Distribution
- **Battery:** 2S Li-ion battery (7.4 V nominal, 8.4 V peak).
- **Protection:** 5 A inline fuse and physical power switch.
- **ESP32 Power:** Stepped down to 5.0 V via LM2596 buck converter into ESP32 VIN pin. **Never connect raw battery voltage to ESP32 pins.**
- **Common Ground:** All components share a common ground reference.

---

## 4. Step-by-Step Build & Run Instructions (Windows PowerShell)

Follow these exact PowerShell commands to set up, build, test, and deploy the entire project.

### Step 1: Install Tooling & Prerequisites
Open PowerShell as Administrator:
```powershell
# 1. Install Node.js (v20+ or v24 LTS) and Git using winget if not installed:
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install Python.Python.3.12

# 2. Verify installations:
node -v
npm -v
python --version
git --version
```

To install PlatformIO Core (CLI):
```powershell
python -m pip install --upgrade platformio
pio --version
```

### Step 2: Run Automated Tests
From the workspace root:
```powershell
# Run the combined protocol and firmware simulation test suite:
npm test

# Run individual test suites:
npm run test:protocol
npm run test:firmware
```

### Step 3: Compile and Flash the ESP32 Firmware
Connect your ESP32 board via USB:
```powershell
cd "firmware/esp32"

# Compile firmware:
pio run

# Upload to ESP32 (auto-detects COM port):
pio run --target upload

# Open Serial Monitor at 115200 baud:
pio device monitor --baud 115200
```
*Alternatively, you can open `firmware/esp32/src/main.cpp` in Arduino IDE, select "ESP32 Dev Module", install `ArduinoJson` and `WebSockets` via Library Manager, and click Upload.*

### Step 4: Connect to ESP32 Network
1. After booting, the ESP32 broadcasts a Wi-Fi Access Point:
   - **SSID:** `ESP32-AI-RC-Car`
   - **Password:** `esp32car123`
   - **Default IP:** `192.168.4.1`
2. Connect your computer or phone Wi-Fi to this network.
3. Test REST connectivity in PowerShell:
```powershell
# Check health status:
Invoke-RestMethod -Uri "http://192.168.4.1/api/status" -Method Get

# Test Emergency Stop:
Invoke-RestMethod -Uri "http://192.168.4.1/api/estop" -Method Post

# Reset Emergency Stop:
Invoke-RestMethod -Uri "http://192.168.4.1/api/estop/reset" -Method Post
```

### Step 5: Launch the React.js Web Dashboard
From the root directory:
```powershell
# Navigate to web dashboard:
cd "apps/web"

# Install dependencies:
npm install

# Start Vite dev server:
npm run dev
```
Open your browser to `http://localhost:3000`. Enter `192.168.4.1` in the header IP input and click **Connect**.
- **Keyboard navigation:** Use `W`, `A`, `S`, `D` or Arrow Keys to steer.
- **Spacebar / Escape:** Emergency Stop.
- **Radar:** Live visual distance meter and obstacle warning.
- **Speech:** Click **Activate Browser Speech Recognition** to issue voice commands ("forward", "back", "left", "right", "stop").

### Step 6: Run the Mobile Controller App (React Native / Expo)
```powershell
cd "apps/mobile"

# Install dependencies:
npm install

# Start Expo development server:
npx expo start
```
Install the **Expo Go** app on your Android device. Scan the terminal QR code to open the controller immediately.

### Step 7: Build Standalone Android APK (EAS Build)
To generate an installable `.apk` file:
```powershell
cd "apps/mobile"

# 1. Install EAS CLI globally:
npm install -g eas-cli

# 2. Log in to Expo account:
eas login

# 3. Configure and start APK cloud build:
eas build --platform android --profile preview

# 4. Once complete, download the APK link provided by EAS and install it on your Android phone!
```

---

## 5. Driving Modes & Safety Operations

1. **Manual Mode:**
   - Directional controls with press-and-hold lease (`500 ms`). Motion halts if control is released.
   - Proximity guard halts forward motion if obstacle is $\le 18\text{ cm}$.
2. **Voice Mode:**
   - On-device INMP441 audio DSP classifies speech bursts locally.
   - Separate phone/web browser speech interface sends validated JSON packets.
   - Keyword allowlist: `"forward"`, `"back"`, `"left"`, `"right"`, `"stop"`.
3. **Obstacle Avoidance Mode:**
   - Autonomous forward cruise $\rightarrow$ Obstacle detected $\rightarrow$ Halts $\rightarrow$ Backs up 400ms $\rightarrow$ Turns right 500ms $\rightarrow$ Verifies clearance $\rightarrow$ Resumes forward cruise.
4. **Follow Target Mode (Experimental):**
   - Proportional ultrasonic follower maintaining 20 cm - 40 cm target distance.
   - Distance $< 18\text{ cm}$: Reverses.
   - Distance $> 40\text{ cm}$: Drives forward.
   - Distance $> 65\text{ cm}$: Safely stops.

---

## 6. Verification & Test Evidence

All automated test suites pass deterministically:
```text
✔ Protocol Version must be 1
✔ Valid motion command passes schema validation
✔ Clamps speed to 0-100 boundary
✔ Rejects invalid protocol version
✔ Rejects missing id and invalid mode
✔ Emergency Stop command structure is correct
✔ Voice command allowlist checks
----------------------------------------------------------------------
Ran 7 node tests: PASS (0 failures)
Ran 6 python simulation tests: PASS (0 failures)
```

License: MIT
