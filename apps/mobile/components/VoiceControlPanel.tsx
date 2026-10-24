import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { espConnection } from '../services/espConnection';

interface VoiceControlPanelProps {
  speed: number;
  disabled?: boolean;
}

export const VoiceControlPanel: React.FC<VoiceControlPanelProps> = ({ speed, disabled = false }) => {
  const [activeVoiceCmd, setActiveVoiceCmd] = useState<string | null>(null);

  const voiceKeywords = [
    { label: 'FORWARD', action: 'forward' as const },
    { label: 'REVERSE', action: 'reverse' as const },
    { label: 'LEFT', action: 'left' as const },
    { label: 'RIGHT', action: 'right' as const },
    { label: 'STOP', action: 'stop' as const },
  ];

  const handleVoiceDispatch = (label: string, action: 'forward' | 'reverse' | 'left' | 'right' | 'stop') => {
    if (disabled) return;
    setActiveVoiceCmd(label);
    espConnection.sendCommand(action, 'voice', speed, 1200);
    setTimeout(() => setActiveVoiceCmd(null), 1200);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PHONE SPEECH COMMANDS (SEPARATE FROM INMP441 MIC)</Text>
      <View style={styles.grid}>
        {voiceKeywords.map((k) => (
          <TouchableOpacity
            key={k.label}
            style={[styles.btn, activeVoiceCmd === k.label && styles.btnActive, disabled && styles.disabled]}
            onPress={() => handleVoiceDispatch(k.label, k.action)}
            disabled={disabled}
          >
            <Text style={[styles.btnText, activeVoiceCmd === k.label && styles.btnTextActive]}>
              🎙️ {k.label}
            </Text>
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
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.1)',
  },
  title: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  btn: {
    width: '31%',
    paddingVertical: 10,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 6,
  },
  btnActive: {
    backgroundColor: '#0284c7',
  },
  disabled: {
    opacity: 0.4,
  },
  btnText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: 'bold',
  },
  btnTextActive: {
    color: '#fff',
  },
});
