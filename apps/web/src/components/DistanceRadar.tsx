import React, { useEffect, useRef } from 'react';

interface DistanceRadarProps {
  distanceCm: number;
  obstacle: boolean;
  safeDistanceCm?: number;
}

export const DistanceRadar: React.FC<DistanceRadarProps> = ({
  distanceCm,
  obstacle,
  safeDistanceCm = 20,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let angle = 0;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h - 20;
      const maxR = h - 30;

      ctx.clearRect(0, 0, w, h);

      // Background grid arc
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.lineWidth = 1;
      for (let r = 30; r <= maxR; r += 35) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI, 0);
        ctx.stroke();
      }

      // Safe distance threshold ring
      const safeRadius = Math.min(maxR, (safeDistanceCm / 100) * maxR);
      ctx.beginPath();
      ctx.strokeStyle = obstacle ? 'rgba(239, 68, 68, 0.8)' : 'rgba(245, 158, 11, 0.4)';
      ctx.setLineDash([4, 4]);
      ctx.arc(cx, cy, safeRadius, Math.PI, 0);
      ctx.stroke();
      ctx.setLineDash([]);

      // Angular grid lines
      for (let deg = 30; deg <= 150; deg += 30) {
        const rad = (deg * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx - maxR * Math.cos(rad), cy - maxR * Math.sin(rad));
        ctx.stroke();
      }

      // Sweeping radar beam
      angle += 0.04;
      const sweepRad = Math.PI + (Math.sin(angle) * 0.5 + 0.5) * Math.PI;
      const gradient = ctx.createRadialGradient(cx, cy, 10, cx, cy, maxR);
      gradient.addColorStop(0, 'rgba(0, 240, 255, 0.2)');
      gradient.addColorStop(1, 'rgba(0, 240, 255, 0)');

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, sweepRad - 0.2, sweepRad);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Obstacle detection blip
      if (distanceCm > 0 && distanceCm <= 120) {
        const blipRadius = Math.max(15, Math.min(maxR, (distanceCm / 120) * maxR));
        const blipY = cy - blipRadius;

        ctx.beginPath();
        ctx.arc(cx, blipY, 8, 0, Math.PI * 2);
        ctx.fillStyle = obstacle ? '#ef4444' : '#00f0ff';
        ctx.shadowColor = obstacle ? '#ef4444' : '#00f0ff';
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.fillText(`${distanceCm.toFixed(1)} cm`, cx, blipY - 12);
      }

      // Vehicle base icon
      ctx.beginPath();
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(cx - 14, cy - 8, 28, 16);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cx - 10, cy - 6, 20, 12);

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [distanceCm, obstacle, safeDistanceCm]);

  return (
    <div className="radar-wrap">
      <canvas ref={canvasRef} width={280} height={180} className="radar-canvas" />
      <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
        <span style={{ fontSize: '0.8rem', color: obstacle ? '#ef4444' : '#94a3b8', fontFamily: 'JetBrains Mono' }}>
          {obstacle ? '⚠️ OBSTACLE DETECTED IN PATH' : 'PATH CLEAR'}
        </span>
      </div>
    </div>
  );
};
