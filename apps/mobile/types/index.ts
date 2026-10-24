export type DrivingMode =
  | 'manual'
  | 'voice'
  | 'obstacle_avoidance'
  | 'follow_target';

export type MotionAction =
  | 'forward'
  | 'reverse'
  | 'left'
  | 'right'
  | 'stop'
  | 'estop'
  | 'estop_reset';

export interface MobileTelemetry {
  version: number;
  type: 'telemetry';
  timestamp_ms: number;
  mode: DrivingMode;
  motion: string;
  distance_cm: number;
  speed: number;
  obstacle: boolean;
  fault: string | null;
  rssi?: number;
  voice_keyword?: string | null;
}
