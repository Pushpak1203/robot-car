import React, { useState } from 'react';
import { carClient } from '../services/carClient';

interface HeaderProps {
  connected: boolean;
  latencyMs: number;
}

export const Header: React.FC<HeaderProps> = ({ connected, latencyMs }) => {
  const [ip, setIp] = useState(carClient.getHost());

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    carClient.setHost(ip);
  };

  return (
    <header className="header-bar glass-panel">
      <div className="brand-section">
        <div className="brand-icon">RC</div>
        <div>
          <h1 className="brand-title">ESP32 AI RC CAR</h1>
          <span className="brand-badge">MISSION CONTROL HUD</span>
        </div>
      </div>

      <form className="connection-box" onSubmit={handleConnect}>
        <input
          type="text"
          className="ip-input"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="192.168.4.1"
          title="ESP32 IP address or hostname"
        />
        <button type="submit" className="btn-connect">
          Connect
        </button>
        <div className={`status-pill ${connected ? 'online' : 'offline'}`}>
          <div className="status-dot"></div>
          <span>{connected ? `ONLINE (${latencyMs}ms)` : 'DISCONNECTED'}</span>
        </div>
      </form>
    </header>
  );
};
