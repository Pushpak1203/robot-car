import {
  PROTOCOL_VERSION,
  ALLOWED_VOICE_COMMANDS,
} from './types.ts';
import type {
  CarCommand,
  CarTelemetry,
  DrivingMode,
  CarAction,
} from './types.ts';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedCommand?: CarCommand;
}

const VALID_MODES: Set<DrivingMode> = new Set([
  'manual',
  'voice',
  'obstacle_avoidance',
  'follow_target',
]);

const VALID_ACTIONS: Set<CarAction> = new Set([
  'forward',
  'reverse',
  'left',
  'right',
  'stop',
  'estop',
  'estop_reset',
]);

export function validateCommand(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be a non-null object'] };
  }

  const raw = input as Record<string, unknown>;

  if (typeof raw.version !== 'number' || raw.version !== PROTOCOL_VERSION) {
    errors.push(`Invalid protocol version: expected ${PROTOCOL_VERSION}`);
  }

  if (raw.type !== 'command') {
    errors.push('Field "type" must be exactly "command"');
  }

  if (!raw.id || typeof raw.id !== 'string' || raw.id.trim().length === 0) {
    errors.push('Field "id" must be a non-empty string identifier');
  }

  if (!raw.mode || !VALID_MODES.has(raw.mode as DrivingMode)) {
    errors.push(`Field "mode" must be one of: ${Array.from(VALID_MODES).join(', ')}`);
  }

  if (!raw.action || !VALID_ACTIONS.has(raw.action as CarAction)) {
    errors.push(`Field "action" must be one of: ${Array.from(VALID_ACTIONS).join(', ')}`);
  }

  let sanitizedSpeed = 60;
  if (raw.speed !== undefined) {
    if (typeof raw.speed !== 'number' || isNaN(raw.speed)) {
      errors.push('Field "speed" must be a number if specified');
    } else {
      sanitizedSpeed = Math.max(0, Math.min(100, Math.round(raw.speed)));
    }
  }

  let sanitizedLease = 500;
  if (raw.lease_ms !== undefined) {
    if (typeof raw.lease_ms !== 'number' || isNaN(raw.lease_ms)) {
      errors.push('Field "lease_ms" must be a number if specified');
    } else {
      // Lease must be between 100ms and 5000ms
      sanitizedLease = Math.max(100, Math.min(5000, Math.round(raw.lease_ms)));
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const sanitizedCommand: CarCommand = {
    version: PROTOCOL_VERSION,
    type: 'command',
    id: String(raw.id),
    mode: raw.mode as DrivingMode,
    action: raw.action as CarAction,
    speed: sanitizedSpeed,
    lease_ms: sanitizedLease,
  };

  return {
    valid: true,
    errors: [],
    sanitizedCommand,
  };
}

export function isVoiceCommandAllowed(keyword: string): boolean {
  const normalized = keyword.toLowerCase().trim();
  return ALLOWED_VOICE_COMMANDS.includes(normalized as any);
}

export function createCommand(
  action: CarAction,
  mode: DrivingMode = 'manual',
  speed = 60,
  leaseMs = 500
): CarCommand {
  const id = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  return {
    version: PROTOCOL_VERSION,
    type: 'command',
    id,
    mode,
    action,
    speed: Math.max(0, Math.min(100, speed)),
    lease_ms: Math.max(100, Math.min(5000, leaseMs)),
  };
}

export function createEmergencyStopCommand(): CarCommand {
  return createCommand('estop', 'manual', 0, 1000);
}

export function createEmergencyResetCommand(): CarCommand {
  return createCommand('estop_reset', 'manual', 0, 1000);
}
