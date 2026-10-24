import React from 'react';
import { carClient } from '../services/carClient';

interface ModeSelectorProps {
  currentMode: 'manual' | 'voice' | 'obstacle_avoidance' | 'follow_target';
  disabled?: boolean;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ currentMode, disabled = false }) => {
  const modes = [
    {
      id: 'manual' as const,
      name: 'MANUAL',
      desc: 'D-Pad / WASD Leased Control',
      icon: '🎮',
    },
    {
      id: 'voice' as const,
      name: 'VOICE CONTROL',
      desc: 'Mic & Web Speech Recognition',
      icon: '🎙️',
    },
    {
      id: 'obstacle_avoidance' as const,
      name: 'OBSTACLE AVOIDANCE',
      desc: 'Autonomous Proximity Cruise',
      icon: '🛡️',
    },
    {
      id: 'follow_target' as const,
      name: 'FOLLOW TARGET',
      desc: 'Ultrasonic Distance Tracker',
      icon: '🎯',
    },
  ];

  const handleSelect = (mode: 'manual' | 'voice' | 'obstacle_avoidance' | 'follow_target') => {
    if (disabled) return;
    carClient.sendCommand('stop', mode, 60, 500);
  };

  return (
    <div className="modes-grid">
      {modes.map((m) => (
        <button
          key={m.id}
          className={`mode-btn ${currentMode === m.id ? 'active' : ''}`}
          onClick={() => handleSelect(m.id)}
          disabled={disabled}
        >
          <div className="mode-name">
            {m.icon} {m.name}
          </div>
          <div className="mode-desc">{m.desc}</div>
        </button>
      ))}
    </div>
  );
};
