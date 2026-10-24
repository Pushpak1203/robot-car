import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { MobileTelemetry } from '../types';

interface DistanceGaugeProps {
  telemetry: MobileTelemetry | null;
}

export const DistanceGauge: React.FC<DistanceGaugeProps> = ({ telemetry }) => {
  const distance = telemetry ? telemetry.distance_cm.toFixed(1) : '--';
  const obstacle = telemetry?.obstacle ?? false;
  const motion = telemetry?.motion ?? 'stopped';
  const rssi = telemetry?.rssi ? `${telemetry.rssi} dBm` : '--';

  return (
    <View style={[styles.container, obstacle && styles.containerHazard]}>
      <View style={styles.metricItem}>
        <Text style={styles.label}>PROXIMITY</Text>
        <Text style={[styles.value, obstacle ? styles.textHazard : styles.textCyan]}>
          {distance} <Text style={styles.unit}>cm</Text>
        </Text>
      </View>

      <View style={styles.metricItem}>
        <Text style={styles.label}>MOTION</Text>
        <Text style={[styles.value, styles.textWhite]}>
          {motion.toUpperCase()}
        </Text>
      </View>

      <View style={styles.metricItem}>
        <Text style={styles.label}>SIGNAL</Text>
        <Text style={[styles.value, styles.textDim]}>
          {rssi}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 12,
    backgroundColor: '#0d1527',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    marginVertical: 6,
  },
  containerHazard: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  metricItem: {
    alignItems: 'center',
  },
  label: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
  },
  value: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  unit: {
    fontSize: 11,
    fontWeight: 'normal',
  },
  textCyan: {
    color: '#38bdf8',
  },
  textHazard: {
    color: '#ef4444',
  },
  textWhite: {
    color: '#f8fafc',
  },
  textDim: {
    color: '#94a3b8',
    fontSize: 14,
  },
});
