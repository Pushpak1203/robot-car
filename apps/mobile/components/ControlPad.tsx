import React, { useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { espConnection } from '../services/espConnection';
import { MotionAction } from '../types';

interface ControlPadProps {
  speed: number;
  disabled?: boolean;
}

export const ControlPad: React.FC<ControlPadProps> = ({ speed, disabled = false }) => {
  const repeatTimer = useRef<any>(null);

  const startAction = (action: MotionAction) => {
    if (disabled) return;
    espConnection.sendCommand(action, 'manual', speed, 500);

    if (repeatTimer.current) clearInterval(repeatTimer.current);
    repeatTimer.current = setInterval(() => {
      espConnection.sendCommand(action, 'manual', speed, 500);
    }, 250);
  };

  const stopAction = () => {
    if (repeatTimer.current) {
      clearInterval(repeatTimer.current);
      repeatTimer.current = null;
    }
    espConnection.sendCommand('stop', 'manual', 0, 500);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.btn, styles.btnFwd, disabled && styles.btnDisabled]}
        onPressIn={() => startAction('forward')}
        onPressOut={stopAction}
        activeOpacity={0.7}
        disabled={disabled}
      >
        <Text style={styles.arrowText}>▲</Text>
      </TouchableOpacity>

      <View style={styles.middleRow}>
        <TouchableOpacity
          style={[styles.btn, styles.btnSide, disabled && styles.btnDisabled]}
          onPressIn={() => startAction('left')}
          onPressOut={stopAction}
          activeOpacity={0.7}
          disabled={disabled}
        >
          <Text style={styles.arrowText}>◀</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnCenter} onPress={stopAction}>
          <Text style={styles.centerText}>STOP</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnSide, disabled && styles.btnDisabled]}
          onPressIn={() => startAction('right')}
          onPressOut={stopAction}
          activeOpacity={0.7}
          disabled={disabled}
        >
          <Text style={styles.arrowText}>▶</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.btn, styles.btnRev, disabled && styles.btnDisabled]}
        onPressIn={() => startAction('reverse')}
        onPressOut={stopAction}
        activeOpacity={0.7}
        disabled={disabled}
      >
        <Text style={styles.arrowText}>▼</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 12,
  },
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  btn: {
    width: 75,
    height: 75,
    backgroundColor: '#1e293b',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  btnFwd: {},
  btnRev: {},
  btnSide: {
    marginHorizontal: 12,
  },
  btnCenter: {
    width: 65,
    height: 65,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  arrowText: {
    color: '#38bdf8',
    fontSize: 26,
    fontWeight: 'bold',
  },
  centerText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
