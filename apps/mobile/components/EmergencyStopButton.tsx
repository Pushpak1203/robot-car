import React from 'react';
import { StyleSheet, TouchableOpacity, Text } from 'react-native';
import { espConnection } from '../services/espConnection';

interface EmergencyStopButtonProps {
  estopActive: boolean;
}

export const EmergencyStopButton: React.FC<EmergencyStopButtonProps> = ({ estopActive }) => {
  const handlePress = () => {
    if (estopActive) {
      espConnection.resetEmergencyStop();
    } else {
      espConnection.emergencyStop();
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, estopActive ? styles.buttonActive : styles.buttonNormal]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <Text style={styles.text}>
        {estopActive ? '⚠️ E-STOP ACTIVE — TAP TO RESET' : '🛑 EMERGENCY STOP'}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  buttonNormal: {
    backgroundColor: '#ef4444',
  },
  buttonActive: {
    backgroundColor: '#10b981',
  },
  text: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 1,
  },
});
