import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { espConnection } from '../services/espConnection';
import { DrivingMode } from '../types';

interface ModeSelectorProps {
  currentMode: DrivingMode;
  disabled?: boolean;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ currentMode, disabled = false }) => {
  const modes: { id: DrivingMode; label: string }[] = [
    { id: 'manual', label: 'Manual' },
    { id: 'voice', label: 'Voice' },
    { id: 'obstacle_avoidance', label: 'Avoid' },
    { id: 'follow_target', label: 'Follow' },
  ];

  const handleSelect = (mode: DrivingMode) => {
    if (disabled) return;
    espConnection.sendCommand('stop', mode, 60, 500);
  };

  return (
    <View style={styles.container}>
      {modes.map((m) => {
        const active = currentMode === m.id;
        return (
          <TouchableOpacity
            key={m.id}
            style={[styles.btn, active && styles.btnActive, disabled && styles.btnDisabled]}
            onPress={() => handleSelect(m.id)}
            disabled={disabled}
          >
            <Text style={[styles.text, active && styles.textActive]}>{m.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    marginHorizontal: 3,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  btnActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  text: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  textActive: {
    color: '#38bdf8',
  },
});
