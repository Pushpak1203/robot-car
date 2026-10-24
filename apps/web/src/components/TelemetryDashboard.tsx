import React from 'react';
import { TelemetryData } from '../services/carClient';

interface TelemetryDashboardProps {
  telemetry: TelemetryData | null;
}

export const TelemetryDashboard: React.FC<TelemetryDashboardProps> = ({ telemetry }) => {
  const mode = telemetry?.mode ?? 'manual';
  const motion = telemetry?.motion ?? 'stopped';
  const distance = telemetry ? telemetry.distance_cm.toFixed(1) : '--';
  const speed = telemetry?.speed ?? 0;
  const rssi = telemetry?.rssi ? `${telemetry.rssi} dBm` : '--';
  const fault = telemetry?.fault;
  const keyword = telemetry?.voice_keyword;

  return (
    <div className="telemetry-row">
      <div className="hud-stat-box">
        <div className="hud-label">Mode</div>
        <div className="hud-value" style={{ fontSize: '1.1rem', textTransform: 'uppercase' }}>
          {mode.replace('_', ' ')}
        </div>
      </div>

      <div className="hud-stat-box">
        <div className="hud-label">Motion State</div>
        <div
          className="hud-value"
          style={{
            fontSize: '1.1rem',
            color: motion === 'estop_locked' ? '#ef4444' : motion === 'stopped' ? '#94a3b8' : '#10b981',
          }}
        >
          {motion.replace('_', ' ')}
        </div>
      </div>

      <div className="hud-stat-box">
        <div className="hud-label">Proximity</div>
        <div className="hud-value" style={{ color: telemetry?.obstacle ? '#ef4444' : '#00f0ff' }}>
          {distance}
          <span className="hud-unit">cm</span>
        </div>
      </div>

      <div className="hud-stat-box">
        <div className="hud-label">Target Speed</div>
        <div className="hud-value">
          {speed}
          <span className="hud-unit">%</span>
        </div>
      </div>

      <div className="hud-stat-box">
        <div className="hud-label">Wi-Fi Signal</div>
        <div className="hud-value" style={{ fontSize: '1.1rem' }}>
          {rssi}
        </div>
      </div>

      {fault && (
        <div className="hud-stat-box" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
          <div className="hud-label" style={{ color: '#ef4444' }}>Fault Code</div>
          <div className="hud-value" style={{ color: '#ef4444', fontSize: '1rem' }}>
            {fault}
          </div>
        </div>
      )}

      {keyword && (
        <div className="hud-stat-box" style={{ borderColor: 'rgba(16, 185, 129, 0.4)' }}>
          <div className="hud-label" style={{ color: '#10b981' }}>Voice Keyword</div>
          <div className="hud-value" style={{ color: '#10b981', fontSize: '1.1rem' }}>
            "{keyword}"
          </div>
        </div>
      )}
    </div>
  );
};
