import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';

interface SpeedSliderProps {
  speed: number;
  onSpeedChange: (speed: number) => void;
  disabled?: boolean;
}

export const SpeedSlider: React.FC<SpeedSliderProps> = ({
  speed,
  onSpeedChange,
  disabled = false,
}) => {
  const steps = [40, 60, 80, 100];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SPEED PRESET</Text>
        <Text style={styles.value}>{speed}%</Text>
      </View>
      <View style={styles.btnRow}>
        {steps.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.stepBtn, speed === s && styles.stepBtnActive, disabled && styles.disabled]}
            onPress={() => onSpeedChange(s)}
            disabled={disabled}
          >
            <Text style={[styles.stepText, speed === s && styles.stepTextActive]}>{s}%</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 10,
    backgroundColor: '#0d1527',
    borderRadius: 8,
    marginVertical: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: 'bold',
  },
  value: {
    color: '#38bdf8',
    fontWeight: 'bold',
    fontSize: 12,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepBtn: {
    flex: 1,
    paddingVertical: 8,
    marginHorizontal: 3,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  stepBtnActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
  },
  disabled: {
    opacity: 0.4,
  },
  stepText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  stepTextActive: {
    color: '#38bdf8',
  },
});
