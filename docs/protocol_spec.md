# ESP32 AI RC Car — JSON Communication Protocol Specification

**Protocol Version:** `1`  
**Network Transports:**
- **WebSocket:** Port 81 (`ws://<ip>:81`) for sub-10ms latency control and 10 Hz telemetry streaming.
- **REST HTTP:** Port 80 (`http://<ip>/api/...`) for commands, emergency stop, configuration, and diagnostics.

---

## 1. Command Schema

Clients (Mobile or Web) transmit JSON command frames to control motion, change driving mode, adjust speed, or trigger safety states.

### JSON Schema:
```json
{
  "version": 1,
  "type": "command",
  "id": "cmd_1719248102_a8b",
  "mode": "manual",
  "action": "forward",
  "speed": 65,
  "lease_ms": 500
}
```

### Field Definitions:
- `version` *(number, required)*: Must be `1`.
- `type` *(string, required)*: Must be `"command"`.
- `id` *(string, required)*: Unique client-generated correlation ID.
- `mode` *(string, required)*: One of:
  - `"manual"`: Direct joystick / D-pad control with lease expiration.
  - `"voice"`: Voice command control mode.
  - `"obstacle_avoidance"`: Autonomous cruise with ultrasonic hazard avoidance.
  - `"follow_target"`: Experimental distance-following mode.
- `action` *(string, required)*: One of:
  - `"forward"`, `"reverse"`, `"left"`, `"right"`, `"stop"`
  - `"estop"`: Immediate hardware emergency stop.
  - `"estop_reset"`: Clears emergency stop lock.
- `speed` *(number, optional)*: Speed percentage `40` to `100`. Default `60`.
- `lease_ms` *(number, optional)*: Heartbeat lease duration in milliseconds (`100` to `5000`). If no subsequent motion command arrives before the lease expires, motors automatically halt.

---

## 2. Telemetry Schema

The ESP32 broadcasts a telemetry frame over WebSocket every 100 ms (10 Hz) and in response to `GET /api/status`.

### JSON Schema:
```json
{
  "version": 1,
  "type": "telemetry",
  "timestamp_ms": 142850,
  "mode": "manual",
  "motion": "forward",
  "distance_cm": 42.5,
  "speed": 65,
  "obstacle": false,
  "fault": null,
  "rssi": -58,
  "active_clients": 1,
  "voice_keyword": null
}
```

### Field Definitions:
- `timestamp_ms` *(number)*: Milliseconds since ESP32 boot (`millis()`).
- `mode` *(string)*: Active driving mode.
- `motion` *(string)*: Current physical state (`stopped`, `forward`, `reverse`, `turning_left`, `turning_right`, `estop_locked`, `recovering`).
- `distance_cm` *(number)*: Median-filtered ultrasonic distance in centimeters.
- `obstacle` *(boolean)*: `true` if distance <= safe obstacle threshold.
- `fault` *(string | null)*: Active safety fault code (`E_STOP`, `COMM_TIMEOUT`, `SENSOR_FAULT`, or `null`).
- `voice_keyword` *(string | null)*: Last keyword recognized by on-device DSP within past 1000ms.

---

## 3. REST API Endpoints

### `GET /api/status`
Returns the current telemetry snapshot.

### `POST /api/command`
Submits a command. Returns an acknowledgment:
```json
{
  "version": 1,
  "type": "ack",
  "id": "cmd_1719248102_a8b",
  "status": "ok"
}
```
If rejected:
```json
{
  "version": 1,
  "type": "ack",
  "status": "rejected",
  "reason": "Obstacle blocked"
}
```

### `POST /api/estop`
Immediately halts all PWM channels, disables motor H-bridges, and locks safety state.
```json
{
  "status": "ok",
  "action": "estop",
  "estop_active": true
}
```

### `POST /api/estop/reset`
Clears emergency stop lock.
```json
{
  "status": "ok",
  "action": "estop_reset",
  "estop_active": false
}
```

### `GET /api/diagnostics`
Returns runtime performance metrics:
```json
{
  "uptime_sec": 342,
  "free_heap_bytes": 182400,
  "min_free_heap_bytes": 169820,
  "wifi_rssi": -62,
  "wifi_ip": "192.168.4.1",
  "wifi_ssid": "ESP32-AI-RC-Car",
  "ws_client_count": 1,
  "loop_latency_us": 142,
  "sensor_read_time_us": 1820,
  "mic_dma_errors": 0,
  "estop_active": false
}
```
