import React from 'react';

export default function ProgressBar({ pct, message }: { pct: number; message?: string | null }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="progress-bar-wrap">
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${clamped}%` }} />
      </div>
      <div className="progress-bar-label">
        <span>{clamped.toFixed(0)}%</span>
        {message ? <span className="progress-bar-message">{message}</span> : null}
      </div>
    </div>
  );
}
