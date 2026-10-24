import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Text } from 'react-native';
import { espConnection } from '../services/espConnection';
import { MobileTelemetry, DrivingMode } from '../types';
import { ConnectionBar } from '../components/ConnectionBar';
import { EmergencyStopButton } from '../components/EmergencyStopButton';
import { DistanceGauge } from '../components/DistanceGauge';
import { ControlPad } from '../components/ControlPad';
import { SpeedSlider } from '../components/SpeedSlider';
import { ModeSelector } from '../components/ModeSelector';
import { VoiceControlPanel } from '../components/VoiceControlPanel';

export default function ControllerScreen() {
  const [connected, setConnected] = useState(false);
  const [telemetry, setTelemetry] = useState<MobileTelemetry | null>(null);
  const [speed, setSpeed] = useState(60);

  useEffect(() => {
    espConnection.connect();

    const unsubConn = espConnection.onConnectionChange(setConnected);
    const unsubTelem = espConnection.onTelemetry((t) => {
      setTelemetry(t);
      if (t.speed && t.speed > 0) {
        setSpeed(t.speed);
      }
    });

    return () => {
      unsubConn();
      unsubTelem();
      espConnection.disconnect();
    };
  }, []);

  const estopActive = telemetry?.motion === 'estop_locked' || telemetry?.fault === 'E_STOP';
  const currentMode: DrivingMode = telemetry?.mode ?? 'manual';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ESP32 IP Connection Header */}
      <ConnectionBar connected={connected} />

      {/* Prominent Emergency Stop Button */}
      <EmergencyStopButton estopActive={estopActive} />

      {/* Live Distance & Telemetry Display */}
      <DistanceGauge telemetry={telemetry} />

      {/* Driving Mode Selector */}
      <Text style={styles.sectionTitle}>DRIVING MODE</Text>
      <ModeSelector currentMode={currentMode} disabled={estopActive} />

      {/* Directional Movement Controls */}
      <Text style={styles.sectionTitle}>DIRECTIONAL CONTROL (PRESS & HOLD)</Text>
      <ControlPad speed={speed} disabled={estopActive || currentMode !== 'manual'} />

      {/* Speed Slider / Selector */}
      <SpeedSlider speed={speed} onSpeedChange={setSpeed} disabled={estopActive} />

      {/* Phone-Based Speech Command Interface */}
      <VoiceControlPanel speed={speed} disabled={estopActive} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070b14',
  },
  content: {
    padding: 14,
    paddingBottom: 30,
  },
  sectionTitle: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
});
