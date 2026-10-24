# ESP32 AI RC Car — Hardware Wiring & Electrical Specification

## 1. Complete GPIO Pinout Matrix

| Peripheral | ESP32 GPIO | Peripheral Pin | Signal Type | Electrical Notes |
| :--- | :--- | :--- | :--- | :--- |
| **L298N Channel A** | GPIO 25 | IN1 | Digital Output | Left Motors Forward |
| **L298N Channel A** | GPIO 26 | IN2 | Digital Output | Left Motors Reverse |
| **L298N Channel B** | GPIO 27 | IN3 | Digital Output | Right Motors Forward |
| **L298N Channel B** | GPIO 14 | IN4 | Digital Output | Right Motors Reverse |
| **L298N PWM ENA** | GPIO 32 | ENA (jumper removed) | PWM Output (LEDC 0) | 20 kHz ultrasonic PWM |
| **L298N PWM ENB** | GPIO 33 | ENB (jumper removed) | PWM Output (LEDC 1) | 20 kHz ultrasonic PWM |
| **HC-SR04 Trigger** | GPIO 13 | TRIG | Digital Output | 3.3V logic to 5V sensor (valid) |
| **HC-SR04 Echo** | GPIO 12 | ECHO | Digital Input | **MUST USE VOLTAGE DIVIDER!** |
| **INMP441 BCLK** | GPIO 18 | SCK / BCLK | I2S Bit Clock | Serial Clock |
| **INMP441 LRCLK** | GPIO 19 | WS / LRCLK | I2S Word Select | Left/Right Clock |
| **INMP441 DOUT** | GPIO 21 | SD / DOUT | I2S Serial Data | Audio sample data into ESP32 |
| **Status LED** | GPIO 2 | Onboard LED | Digital Output | Heartbeat & E-Stop strobe |

---

## 2. Ultrasonic Sensor (HC-SR04) Voltage Divider

> [!CAUTION]
> The HC-SR04 runs at 5.0 V VCC. Its ECHO output produces a **5.0 V pulse**. 
> The ESP32 GPIO pins are rated for **maximum 3.3 V** (non-5V tolerant). Connecting ECHO directly will permanently damage the ESP32 input stage.

### Schematic:
```text
HC-SR04 ECHO (5V Out) 
       │
      [R1: 1.0 kΩ]
       │
       ├───► Connected to ESP32 GPIO 12 (Echo In)
       │
      [R2: 2.0 kΩ or 2.2 kΩ]
       │
      GND (Common Ground)
```

### Voltage Calculation:
$$V_{out} = V_{in} \times \frac{R_2}{R_1 + R_2} = 5.0\,\text{V} \times \frac{2.0\,\text{k}\Omega}{1.0\,\text{k}\Omega + 2.0\,\text{k}\Omega} = 3.33\,\text{V}$$
*(Safe logic HIGH level for ESP32 GPIO 12)*

---

## 3. INMP441 MEMS Microphone Connections

The INMP441 operates at 3.3 V logic:
- **VDD** -> ESP32 3.3V
- **GND** -> Common GND
- **SD**  -> ESP32 GPIO 21
- **WS**  -> ESP32 GPIO 19
- **SCK** -> ESP32 GPIO 18
- **L/R** -> **Connect to GND** (sets microphone to LEFT channel audio)

---

## 4. Power System & Thermal Limits

### Power Architecture
```text
[ 2S Li-ion Battery 7.4V (8.4V Peak) ]
      │
     [ 5A Inline Fuse ] ──► [ Main Power Switch ]
      │
      ├───────────────────────────────► L298N VMS (Motor Power Terminal)
      │
     [ LM2596 DC-DC Buck Converter ]
      │ (Tuned to exactly 5.0 V)
      │
      ├───────────────────────────────► ESP32 VIN (5V Pin)
      ├───────────────────────────────► HC-SR04 VCC (5V Pin)
      └───────────────────────────────► Common Ground Rail
```

### Critical Rules:
1. **Never connect raw battery voltage directly to the ESP32 5V or 3.3V pins.**
2. **Common Ground:** All GND lines (Battery (-), LM2596 OUT (-), ESP32 GND, L298N GND, and sensors) **MUST** be connected to a shared star ground point.
3. **L298N 5V Jumper:** When supplying 7.4V to VMS, the onboard 5V regulator jumper can remain on, but **do NOT** feed the L298N onboard 5V pin into the ESP32—power the ESP32 exclusively from the dedicated LM2596 buck converter to avoid brownouts.
4. **Motor Stall Current:**
   - Standard yellow TT DC gear motors draw ~150mA no-load, but stall current is **0.8A to 1.2A per motor** at 7.4V.
   - Channel A drives 2 motors in parallel = **1.6A to 2.4A stall current**.
   - Channel B drives 2 motors in parallel = **1.6A to 2.4A stall current**.
   - The L298N is rated for 2.0A continuous per channel. If the car gets mechanically jammed, current will exceed safe thermal dissipation!
   - Mount an aluminum heatsink on the L298N and ensure firmware speed limiting and ramping are enabled.
