import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCommand,
  createCommand,
  createEmergencyStopCommand,
  createEmergencyResetCommand,
  isVoiceCommandAllowed,
  PROTOCOL_VERSION,
} from '../packages/protocol/src/index.ts';

test('Protocol Version must be 1', () => {
  assert.equal(PROTOCOL_VERSION, 1);
});

test('Valid motion command passes schema validation', () => {
  const cmd = createCommand('forward', 'manual', 75, 500);
  const result = validateCommand(cmd);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.ok(result.sanitizedCommand);
  assert.equal(result.sanitizedCommand.action, 'forward');
  assert.equal(result.sanitizedCommand.speed, 75);
  assert.equal(result.sanitizedCommand.lease_ms, 500);
});

test('Clamps speed to 0-100 boundary', () => {
  const overSpeed = createCommand('forward', 'manual', 150, 500);
  const resultOver = validateCommand(overSpeed);
  assert.equal(resultOver.valid, true);
  assert.equal(resultOver.sanitizedCommand?.speed, 100);

  const underSpeed = createCommand('forward', 'manual', -25, 500);
  const resultUnder = validateCommand(underSpeed);
  assert.equal(resultUnder.valid, true);
  assert.equal(resultUnder.sanitizedCommand?.speed, 0);
});

test('Rejects invalid protocol version', () => {
  const badCmd = {
    version: 99,
    type: 'command',
    id: 'test_123',
    mode: 'manual',
    action: 'forward',
  };
  const result = validateCommand(badCmd);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('Invalid protocol version')));
});

test('Rejects missing id and invalid mode', () => {
  const badCmd = {
    version: 1,
    type: 'command',
    id: '',
    mode: 'invalid_mode',
    action: 'forward',
  };
  const result = validateCommand(badCmd);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('id')));
  assert.ok(result.errors.some((e) => e.includes('mode')));
});

test('Emergency Stop command structure is correct', () => {
  const estop = createEmergencyStopCommand();
  const result = validateCommand(estop);
  assert.equal(result.valid, true);
  assert.equal(result.sanitizedCommand?.action, 'estop');

  const reset = createEmergencyResetCommand();
  const resetResult = validateCommand(reset);
  assert.equal(resetResult.valid, true);
  assert.equal(resetResult.sanitizedCommand?.action, 'estop_reset');
});

test('Voice command allowlist checks', () => {
  assert.equal(isVoiceCommandAllowed('stop'), true);
  assert.equal(isVoiceCommandAllowed('forward'), true);
  assert.equal(isVoiceCommandAllowed('back'), true);
  assert.equal(isVoiceCommandAllowed('left'), true);
  assert.equal(isVoiceCommandAllowed('right'), true);
  assert.equal(isVoiceCommandAllowed('STOP'), true);
  assert.equal(isVoiceCommandAllowed('  forward  '), true);

  // Disallowed arbitrary words
  assert.equal(isVoiceCommandAllowed('jump'), false);
  assert.equal(isVoiceCommandAllowed('destroy'), false);
  assert.equal(isVoiceCommandAllowed('dance'), false);
});
