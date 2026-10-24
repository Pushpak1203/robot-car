import React, { useState, useEffect, useRef } from 'react';
import { carClient } from '../services/carClient';

interface VoiceControlModalProps {
  speed: number;
}

export const VoiceControlModal: React.FC<VoiceControlModalProps> = ({ speed }) => {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const text = event.results[current][0].transcript.trim().toLowerCase();
      setTranscript(text);
      processVoiceCommand(text);
    };

    recognition.onerror = (err: any) => {
      console.warn('[Speech] Error:', err);
    };

    recognition.onend = () => {
      if (listening) {
        try {
          recognition.start();
        } catch {}
      }
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
    };
  }, [speed]);

  const processVoiceCommand = (text: string) => {
    let action: 'forward' | 'reverse' | 'left' | 'right' | 'stop' | null = null;

    if (text.includes('stop') || text.includes('halt') || text.includes('freeze')) {
      action = 'stop';
    } else if (text.includes('forward') || text.includes('ahead') || text.includes('straight')) {
      action = 'forward';
    } else if (text.includes('back') || text.includes('reverse')) {
      action = 'reverse';
    } else if (text.includes('left')) {
      action = 'left';
    } else if (text.includes('right')) {
      action = 'right';
    }

    if (action) {
      setLastAction(action.toUpperCase());
      carClient.sendCommand(action, 'voice', speed, 1200);
    }
  };

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setTranscript('');
      setLastAction(null);
      try {
        recognitionRef.current.start();
        setListening(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  if (!supported) {
    return (
      <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', color: '#f87171', fontSize: '0.85rem' }}>
        ⚠️ Web Speech API not supported in this browser. Please use Chrome, Edge, or use the on-device INMP441 microphone.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <button
        onClick={toggleListening}
        style={{
          background: listening ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #0284c7, #0ea5e9)',
          color: 'white',
          padding: '0.85rem 1.25rem',
          borderRadius: '8px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          boxShadow: listening ? '0 0 20px rgba(239, 68, 68, 0.5)' : 'none',
        }}
      >
        <span>{listening ? '🛑 STOP LISTENING' : '🎙️ ACTIVATE BROWSER SPEECH RECOGNITION'}</span>
      </button>

      {listening && (
        <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px' }}>
          <div style={{ color: '#00f0ff', fontFamily: 'JetBrains Mono', fontSize: '0.85rem' }}>
            Listening for: "forward", "back", "left", "right", "stop"
          </div>
          {transcript && (
            <div style={{ marginTop: '0.4rem', color: '#f8fafc', fontSize: '0.9rem' }}>
              Heard: <em>"{transcript}"</em>
            </div>
          )}
          {lastAction && (
            <div style={{ marginTop: '0.3rem', color: '#10b981', fontWeight: 700, fontFamily: 'Orbitron' }}>
              DISPATCHED: {lastAction}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
