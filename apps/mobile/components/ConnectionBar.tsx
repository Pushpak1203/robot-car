import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity } from 'react-native';
import { espConnection } from '../services/espConnection';

interface ConnectionBarProps {
  connected: boolean;
}

export const ConnectionBar: React.FC<ConnectionBarProps> = ({ connected }) => {
  const [ip, setIp] = useState(espConnection.getIp());

  const handleSave = () => {
    espConnection.setIp(ip);
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={ip}
        onChangeText={setIp}
        placeholder="192.168.4.1"
        placeholderTextColor="#64748b"
        keyboardType="numeric"
      />
      <TouchableOpacity style={styles.button} onPress={handleSave}>
        <Text style={styles.btnText}>Connect</Text>
      </TouchableOpacity>
      <View style={[styles.badge, connected ? styles.badgeOnline : styles.badgeOffline]}>
        <View style={[styles.dot, connected ? styles.dotOnline : styles.dotOffline]} />
        <Text style={[styles.statusText, connected ? styles.textOnline : styles.textOffline]}>
          {connected ? 'ONLINE' : 'OFFLINE'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#0d1527',
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  input: {
    flex: 1,
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    fontSize: 14,
    marginRight: 8,
  },
  button: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 8,
  },
  btnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeOnline: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  badgeOffline: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  dotOnline: {
    backgroundColor: '#10b981',
  },
  dotOffline: {
    backgroundColor: '#ef4444',
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  textOnline: {
    color: '#10b981',
  },
  textOffline: {
    color: '#ef4444',
  },
});
