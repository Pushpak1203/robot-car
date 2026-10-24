import React, { useState, useEffect } from 'react';
import { carClient, TelemetryData } from './services/carClient';
import { Header } from './components/Header';
import { EmergencyStop } from './components/EmergencyStop';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { ManualControls } from './components/ManualControls';
import { DistanceRadar } from './components/DistanceRadar';
import { ModeSelector } from './components/ModeSelector';
import { VoiceControlModal } from './components/VoiceControlModal';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import './App.css';

export const App: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [latencyMs, setLatencyMs] = useState(0);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [speed, setSpeed] = useState(60);

  useEffect(() => {
    carClient.connect();

    const unsubConn = carClient.onConnectionChange((conn, lat) => {
      setConnected(conn);
      setLatencyMs(lat);
    });

    const unsubTelem = carClient.onTelemetry((t) => {
      setTelemetry(t);
      if (t.speed && t.speed > 0) {
        setSpeed(t.speed);
      }
    });

    return () => {
      unsubConn();
      unsubTelem();
      carClient.disconnect();
    };
  }, []);

  const estopActive = telemetry?.motion === 'estop_locked' || telemetry?.fault === 'E_STOP';
  const currentMode = telemetry?.mode ?? 'manual';
  const distance = telemetry?.distance_cm ?? 100;
  const obstacle = telemetry?.obstacle ?? false;

  return (
    <div className="app-container">
      {/* Top Navigation & Connection Status */}
      <Header connected={connected} latencyMs={latencyMs} />

      {/* Prominent Emergency Stop Button */}
      <EmergencyStop estopActive={estopActive} />

      {/* Live Telemetry HUD */}
      <section className="glass-panel" style={{ padding: '1.25rem' }}>
        <TelemetryDashboard telemetry={telemetry} />
      </section>

      {/* Core Operational Grid */}
      <div className="dashboard-grid">
        {/* Left Column: Manual Drive Controls & Speed Slider */}
        <div className="col-6 glass-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <span>🎮</span> MANUAL CONTROLS
            </h2>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'JetBrains Mono' }}>
              WASD / ARROW KEYS
            </span>
          </div>
          <div className="panel-body">
            <ManualControls
              speed={speed}
              onSpeedChange={setSpeed}
              disabled={estopActive || currentMode !== 'manual'}
            />
          </div>
        </div>

        {/* Right Column: Proximity Radar & Driving Modes */}
        <div className="col-6 glass-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <span>📡</span> ULTRASONIC RADAR & PROXIMITY
            </h2>
          </div>
          <div className="panel-body">
            <DistanceRadar distanceCm={distance} obstacle={obstacle} safeDistanceCm={20} />
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: '#64748b', fontFamily: 'JetBrains Mono' }}>
                SELECT DRIVING MODE
              </div>
              <ModeSelector currentMode={currentMode} disabled={estopActive} />
            </div>
          </div>
        </div>

        {/* Voice Control Interface */}
        <div className="col-6 glass-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <span>🎙️</span> BROWSER VOICE CONTROL
            </h2>
          </div>
          <div className="panel-body">
            <VoiceControlModal speed={speed} />
          </div>
        </div>

        {/* Diagnostics & Network Health */}
        <div className="col-6 glass-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <span>⚙️</span> DIAGNOSTICS & SYSTEM METRICS
            </h2>
          </div>
          <div className="panel-body">
            <DiagnosticsPanel />
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
