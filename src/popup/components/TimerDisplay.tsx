import React from 'react';
import { formatDuration } from '../../utils/time.ts';

interface TimerDisplayProps {
  elapsedMs: number;
  isRecording: boolean;
}

export const TimerDisplay: React.FC<TimerDisplayProps> = ({ elapsedMs, isRecording }) => {
  const formatted = formatDuration(elapsedMs);

  return (
    <div className="timer-container" aria-live="off" role="timer" aria-label={`Elapsed time: ${formatted}`}>
      <span className="timer-text">{formatted}</span>
      <span className="timer-label">{isRecording ? 'Recording active' : 'Duration'}</span>
    </div>
  );
};
