import React, { useState, useEffect } from 'react';
import { carClient, DiagnosticsData } from '../services/carClient';

export const DiagnosticsPanel: React.FC = () => {
  const [diag, setDiag] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDiagnostics = async () => {
    setLoading(true);
    const data = await carClient.fetchDiagnostics();
    if (data) setDiag(data);
    setLoading(false);
  };

  useEffect(() => {
    loadDiagnostics();
    const timer = setInterval(loadDiagnostics, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontFamily: 'JetBrains Mono' }}>
          SYSTEM DIAGNOSTICS & TELEMETRY HEALTH
        </span>
        <button
          onClick={loadDiagnostics}
          style={{
            background: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: '#38bdf8',
            padding: '0.25rem 0.6rem',
            borderRadius: '4px',
            fontSize: '0.75rem',
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
        <div className="hud-stat-box">
          <div className="hud-label">ESP32 Uptime</div>
          <div className="hud-value" style={{ fontSize: '1.1rem' }}>
            {diag ? `${diag.uptime_sec}s` : '--'}
          </div>
        </div>

        <div className="hud-stat-box">
          <div className="hud-label">Free Heap Memory</div>
          <div className="hud-value" style={{ fontSize: '1.1rem' }}>
            {diag ? `${Math.round(diag.free_heap_bytes / 1024)} KB` : '--'}
          </div>
        </div>

        <div className="hud-stat-box">
          <div className="hud-label">Loop Latency</div>
          <div className="hud-value" style={{ fontSize: '1.1rem' }}>
            {diag ? `${diag.loop_latency_us} µs` : '--'}
          </div>
        </div>

        <div className="hud-stat-box">
          <div className="hud-label">Sensor Ping Time</div>
          <div className="hud-value" style={{ fontSize: '1.1rem' }}>
            {diag ? `${diag.sensor_read_time_us} µs` : '--'}
          </div>
        </div>

        <div className="hud-stat-box">
          <div className="hud-label">Connected Clients</div>
          <div className="hud-value" style={{ fontSize: '1.1rem' }}>
            {diag ? diag.ws_client_count : '--'}
          </div>
        </div>

        <div className="hud-stat-box">
          <div className="hud-label">Microphone DMA Errors</div>
          <div className="hud-value" style={{ fontSize: '1.1rem', color: diag?.mic_dma_errors ? '#ef4444' : '#10b981' }}>
            {diag ? diag.mic_dma_errors : '--'}
          </div>
        </div>
      </div>
    </div>
  );
};
