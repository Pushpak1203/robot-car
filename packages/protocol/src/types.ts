/**
 * Protocol Specification and Type Definitions for ESP32 AI RC Car
 * Version 1.0.0
 */

export const PROTOCOL_VERSION = 1;

export type DrivingMode =
  | 'manual'
  | 'voice'
  | 'obstacle_avoidance'
  | 'follow_target';

export type CarAction =
  | 'forward'
  | 'reverse'
  | 'left'
  | 'right'
  | 'stop'
  | 'estop'
  | 'estop_reset';

export type MotionState =
  | 'stopped'
  | 'forward'
  | 'reverse'
  | 'turning_left'
  | 'turning_right'
  | 'estop_locked'
  | 'recovering';

export type FaultCode =
  | 'NONE'
  | 'E_STOP'
  | 'COMM_TIMEOUT'
  | 'SENSOR_FAULT'
  | 'WATCHDOG_RESET'
  | 'MOTOR_FAULT';

export const ALLOWED_VOICE_COMMANDS = [
  'stop',
  'forward',
  'back',
  'reverse',
  'left',
  'right',
  'faster',
  'slower',
] as const;

export type VoiceKeyword = (typeof ALLOWED_VOICE_COMMANDS)[number];

export interface CarCommand {
  version: number;
  type: 'command';
  id: string;
  mode: DrivingMode;
  action: CarAction;
  speed?: number; // 0 to 100 percentage
  lease_ms?: number; // Default 500ms; motion auto-stops if not renewed
}

export interface CarTelemetry {
  version: number;
  type: 'telemetry';
  timestamp_ms: number;
  mode: DrivingMode;
  motion: MotionState;
  distance_cm: number;
  speed: number;
  obstacle: boolean;
  fault: FaultCode | null;
  rssi?: number;
  battery_mv?: number;
  voice_keyword?: string | null;
  active_clients?: number;
}

export interface CommandAck {
  version: number;
  type: 'ack';
  id: string;
  status: 'ok' | 'rejected';
  reason?: string;
  timestamp_ms?: number;
}

export interface CarConfig {
  min_speed: number;
  max_speed: number;
  safe_distance_cm: number;
  command_timeout_ms: number;
  ramp_rate: number;
  invert_left: boolean;
  invert_right: boolean;
}

export interface DiagnosticsReport {
  uptime_sec: number;
  free_heap_bytes: number;
  min_free_heap_bytes: number;
  wifi_rssi: number;
  wifi_ip: string;
  wifi_ssid: string;
  ws_client_count: number;
  last_command_id: string;
  last_command_time_ms: number;
  loop_latency_us: number;
  sensor_read_time_us: number;
  mic_dma_errors: number;
  estop_active: boolean;
}
