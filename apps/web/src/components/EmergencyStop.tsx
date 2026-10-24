import React from 'react';
import { carClient } from '../services/carClient';

interface EmergencyStopProps {
  estopActive: boolean;
}

export const EmergencyStop: React.FC<EmergencyStopProps> = ({ estopActive }) => {
  const handleToggle = () => {
    if (estopActive) {
      carClient.resetEmergencyStop();
    } else {
      carClient.emergencyStop();
    }
  };

  return (
    <button
      className={`estop-button ${estopActive ? 'locked' : ''}`}
      onClick={handleToggle}
      title="Hardware Emergency Stop Override"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {estopActive ? 'E-STOP ACTIVE — CLICK TO RESET' : 'EMERGENCY STOP (SPACE)'}
    </button>
  );
};
