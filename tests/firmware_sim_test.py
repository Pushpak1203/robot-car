#!/usr/bin/env python3
"""
ESP32 AI RC Car — Firmware Logic & Protocol Simulation Test Suite
Validates safety invariants, motor states, command lease expiration,
and obstacle detection boundaries in Python.
"""

import unittest
import time
import json

class SimulatedESP32Car:
    def __init__(self):
        self.mode = "manual"
        self.motion_state = "stopped"
        self.target_speed = 60
        self.left_pwm = 0
        self.right_pwm = 0
        self.in1 = 0
        self.in2 = 0
        self.in3 = 0
        self.in4 = 0
        self.estop_active = False
        self.fault = None
        self.distance_cm = 100.0
        self.obstacle_detected = False
        self.last_command_time = time.time()
        self.command_lease_sec = 0.5
        self.safe_distance_cm = 18.0

    def set_distance(self, dist):
        self.distance_cm = dist
        # Safety invariant: <= 0 or > 400 is sensor fault, never clear path
        if dist <= 0 or dist > 400.0:
            self.obstacle_detected = True
            self.fault = "SENSOR_FAULT"
        else:
            self.obstacle_detected = (dist <= self.safe_distance_cm)
            if self.fault == "SENSOR_FAULT":
                self.fault = None

    def process_command(self, payload):
        try:
            cmd = json.loads(payload) if isinstance(payload, str) else payload
        except Exception:
            return {"status": "rejected", "reason": "JSON parse error"}

        if cmd.get("version") != 1:
            return {"status": "rejected", "reason": "Invalid version"}
        if cmd.get("type") != "command":
            return {"status": "rejected", "reason": "Invalid type"}

        action = cmd.get("action")
        mode = cmd.get("mode", "manual")
        speed = cmd.get("speed", 60)
        lease_ms = cmd.get("lease_ms", 500)

        if action == "estop":
            self.estop_active = True
            self.fault = "E_STOP"
            self.motion_state = "estop_locked"
            self._stop_motors()
            return {"status": "ok", "action": "estop"}

        if action == "estop_reset":
            self.estop_active = False
            if self.fault == "E_STOP":
                self.fault = None
            self.motion_state = "stopped"
            self._stop_motors()
            return {"status": "ok", "action": "estop_reset"}

        if self.estop_active:
            return {"status": "rejected", "reason": "E-Stop is active"}

        self.mode = mode
        self.target_speed = max(40, min(100, speed))
        self.command_lease_sec = max(0.1, min(5.0, lease_ms / 1000.0))
        self.last_command_time = time.time()

        if self.mode == "manual":
            if action == "forward":
                if self.obstacle_detected:
                    self._stop_motors()
                    return {"status": "rejected", "reason": "Obstacle blocked"}
                self._move_forward()
            elif action == "reverse":
                self._move_reverse()
            elif action == "left":
                self._turn_left()
            elif action == "right":
                self._turn_right()
            elif action == "stop":
                self._stop_motors()

        return {"status": "ok", "id": cmd.get("id")}

    def _move_forward(self):
        self.in1, self.in2 = 1, 0
        self.in3, self.in4 = 1, 0
        self.left_pwm = int((self.target_speed / 100.0) * 255)
        self.right_pwm = self.left_pwm
        self.motion_state = "forward"

    def _move_reverse(self):
        self.in1, self.in2 = 0, 1
        self.in3, self.in4 = 0, 1
        self.left_pwm = int((self.target_speed / 100.0) * 255)
        self.right_pwm = self.left_pwm
        self.motion_state = "reverse"

    def _turn_left(self):
        self.in1, self.in2 = 0, 1
        self.in3, self.in4 = 1, 0
        self.left_pwm = int((self.target_speed / 100.0) * 255)
        self.right_pwm = self.left_pwm
        self.motion_state = "turning_left"

    def _turn_right(self):
        self.in1, self.in2 = 1, 0
        self.in3, self.in4 = 0, 1
        self.left_pwm = int((self.target_speed / 100.0) * 255)
        self.right_pwm = self.left_pwm
        self.motion_state = "turning_right"

    def _stop_motors(self):
        self.in1, self.in2, self.in3, self.in4 = 0, 0, 0, 0
        self.left_pwm = 0
        self.right_pwm = 0
        if not self.estop_active:
            self.motion_state = "stopped"

    def update_safety(self, current_time=None):
        now = time.time() if current_time is None else current_time
        if self.estop_active:
            self._stop_motors()
            return

        # Forward obstacle collision guard
        if self.motion_state == "forward" and self.obstacle_detected:
            self._stop_motors()

        # Command lease expiration in manual mode
        if self.mode == "manual" and self.motion_state != "stopped":
            if now - self.last_command_time > self.command_lease_sec:
                self._stop_motors()


class TestCarSimulation(unittest.TestCase):
    def setUp(self):
        self.car = SimulatedESP32Car()

    def test_boot_state(self):
        """Motors must start completely stopped upon boot."""
        self.assertEqual(self.car.motion_state, "stopped")
        self.assertEqual(self.car.left_pwm, 0)
        self.assertEqual(self.car.right_pwm, 0)
        self.assertEqual(self.car.in1, 0)
        self.assertEqual(self.car.in2, 0)

    def test_forward_movement(self):
        res = self.car.process_command({
            "version": 1,
            "type": "command",
            "id": "1",
            "mode": "manual",
            "action": "forward",
            "speed": 80
        })
        self.assertEqual(res["status"], "ok")
        self.assertEqual(self.car.motion_state, "forward")
        self.assertEqual(self.car.in1, 1)
        self.assertEqual(self.car.in2, 0)
        self.assertEqual(self.car.in3, 1)
        self.assertEqual(self.car.in4, 0)
        self.assertGreater(self.car.left_pwm, 150)

    def test_estop_overrides_everything(self):
        # Move forward first
        self.car.process_command({"version": 1, "type": "command", "id": "1", "action": "forward"})
        self.assertEqual(self.car.motion_state, "forward")

        # Trigger E-Stop
        res = self.car.process_command({"version": 1, "type": "command", "id": "2", "action": "estop"})
        self.assertEqual(res["status"], "ok")
        self.assertEqual(self.car.motion_state, "estop_locked")
        self.assertEqual(self.car.left_pwm, 0)
        self.assertEqual(self.car.right_pwm, 0)

        # Subsequent move command must be rejected
        res_after = self.car.process_command({"version": 1, "type": "command", "id": "3", "action": "forward"})
        self.assertEqual(res_after["status"], "rejected")
        self.assertEqual(self.car.left_pwm, 0)

        # Reset E-Stop
        res_reset = self.car.process_command({"version": 1, "type": "command", "id": "4", "action": "estop_reset"})
        self.assertEqual(res_reset["status"], "ok")
        self.assertEqual(self.car.motion_state, "stopped")

    def test_lease_timeout_stops_motion(self):
        t0 = 1000.0
        self.car.process_command({"version": 1, "type": "command", "id": "1", "action": "forward", "lease_ms": 500})
        self.car.last_command_time = t0
        self.assertEqual(self.car.motion_state, "forward")

        # Within lease (300ms later) -> still running
        self.car.update_safety(current_time=t0 + 0.3)
        self.assertEqual(self.car.motion_state, "forward")

        # After lease (600ms later) -> must be stopped
        self.car.update_safety(current_time=t0 + 0.6)
        self.assertEqual(self.car.motion_state, "stopped")
        self.assertEqual(self.car.left_pwm, 0)

    def test_obstacle_detection_blocks_forward(self):
        # Distance is 12 cm (< safe threshold of 18 cm)
        self.car.set_distance(12.0)
        self.assertTrue(self.car.obstacle_detected)

        # Attempt to drive forward
        res = self.car.process_command({"version": 1, "type": "command", "id": "1", "action": "forward"})
        self.assertEqual(res["status"], "rejected")
        self.assertEqual(self.car.motion_state, "stopped")

    def test_invalid_sensor_reading_never_treated_as_clear(self):
        # Sensor drops to 0 or negative
        self.car.set_distance(0.0)
        self.assertTrue(self.car.obstacle_detected)
        self.assertEqual(self.car.fault, "SENSOR_FAULT")

        # Driving forward must be blocked
        res = self.car.process_command({"version": 1, "type": "command", "id": "1", "action": "forward"})
        self.assertEqual(res["status"], "rejected")


if __name__ == "__main__":
    unittest.main()
