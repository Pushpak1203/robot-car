import React, { useState, useEffect, useRef } from 'react';
import { carClient } from '../services/carClient';

interface ManualControlsProps {
  speed: number;
  onSpeedChange: (speed: number) => void;
  disabled?: boolean;
}

type Direction = 'forward' | 'reverse' | 'left' | 'right' | null;

export const ManualControls: React.FC<ManualControlsProps> = ({
  speed,
  onSpeedChange,
  disabled = false,
}) => {
  const [activeDir, setActiveDir] = useState<Direction>(null);
  const repeatTimer = useRef<number | null>(null);

  const sendMotion = (dir: Direction) => {
    if (!dir || disabled) return;
    carClient.sendCommand(dir, 'manual', speed, 500);
  };

  const handleStart = (dir: Direction) => {
    if (disabled || !dir) return;
    setActiveDir(dir);
    sendMotion(dir);

    if (repeatTimer.current) clearInterval(repeatTimer.current);
    // Periodically refresh the 500ms command lease while holding
    repeatTimer.current = window.setInterval(() => {
      sendMotion(dir);
    }, 250);
  };

  const handleStop = () => {
    if (repeatTimer.current) {
      clearInterval(repeatTimer.current);
      repeatTimer.current = null;
    }
    setActiveDir(null);
    carClient.sendCommand('stop', 'manual', 0, 500);
  };

  // Keyboard navigation listener (W/A/S/D and Arrow Keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || disabled) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
        e.preventDefault();
        handleStart('forward');
      } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleStart('reverse');
      } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        e.preventDefault();
        handleStart('left');
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleStart('right');
      } else if (e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        handleStop();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (disabled) return;
      if (['w', 'W', 's', 'S', 'a', 'A', 'd', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        handleStop();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (repeatTimer.current) clearInterval(repeatTimer.current);
    };
  }, [speed, disabled]);

  return (
    <div>
      <div className="dpad-container">
        {/* Forward */}
        <button
          className={`dpad-btn ${activeDir === 'forward' ? 'active' : ''}`}
          onMouseDown={() => handleStart('forward')}
          onMouseUp={handleStop}
          onTouchStart={() => handleStart('forward')}
          onTouchEnd={handleStop}
          title="Drive Forward (W / Up Arrow)"
          disabled={disabled}
        >
          ▲
        </button>

        {/* Middle Row: Left, Center Stop, Right */}
        <div className="dpad-middle-row">
          <button
            className={`dpad-btn ${activeDir === 'left' ? 'active' : ''}`}
            onMouseDown={() => handleStart('left')}
            onMouseUp={handleStop}
            onTouchStart={() => handleStart('left')}
            onTouchEnd={handleStop}
            title="Steer Left (A / Left Arrow)"
            disabled={disabled}
          >
            ◀
          </button>

          <div className="dpad-center" onClick={handleStop} title="Stop">
            STOP
          </div>

          <button
            className={`dpad-btn ${activeDir === 'right' ? 'active' : ''}`}
            onMouseDown={() => handleStart('right')}
            onMouseUp={handleStop}
            onTouchStart={() => handleStart('right')}
            onTouchEnd={handleStop}
            title="Steer Right (D / Right Arrow)"
            disabled={disabled}
          >
            ▶
          </button>
        </div>

        {/* Reverse */}
        <button
          className={`dpad-btn ${activeDir === 'reverse' ? 'active' : ''}`}
          onMouseDown={() => handleStart('reverse')}
          onMouseUp={handleStop}
          onTouchStart={() => handleStart('reverse')}
          onTouchEnd={handleStop}
          title="Drive Reverse (S / Down Arrow)"
          disabled={disabled}
        >
          ▼
        </button>
      </div>

      {/* Speed Slider */}
      <div className="speed-slider-wrap">
        <div className="slider-labels">
          <span>SPEED LIMIT</span>
          <span style={{ color: '#00f0ff', fontWeight: 'bold' }}>{speed}%</span>
        </div>
        <input
          type="range"
          min="40"
          max="100"
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="slider-input"
          disabled={disabled}
        />
      </div>
    </div>
  );
};
