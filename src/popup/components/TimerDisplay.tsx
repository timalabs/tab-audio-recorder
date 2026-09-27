import React from 'react';
import { formatDuration } from '../../utils/time.ts';
import { RecordingStatus } from '../../recorder/RecorderState.ts';

interface TimerDisplayProps {
  elapsedMs: number;
  isRecording: boolean;
  status?: RecordingStatus;
}

export const TimerDisplay: React.FC<TimerDisplayProps> = ({
  elapsedMs,
  isRecording,
  status = 'IDLE',
}) => {
  const formatted = formatDuration(elapsedMs);

  let label = 'Duration';
  if (status === 'WAITING_FOR_AUDIO') {
    label = 'Waiting for audio...';
  } else if (status === 'AUDIO_DETECTED') {
    label = 'Audio detected';
  } else if (isRecording) {
    label = '🔴 Recording';
  } else if (status === 'STARTING') {
    label = 'Connecting to tab...';
  }

  const isWaiting = status === 'WAITING_FOR_AUDIO';
  const isDetected = status === 'AUDIO_DETECTED';

  return (
    <div
      className={`timer-container ${isWaiting ? 'timer-waiting' : ''} ${isDetected ? 'timer-detected' : ''}`}
      aria-live="off"
      role="timer"
      aria-label={`Elapsed time: ${formatted}, status: ${label}`}
    >
      <span className="timer-text">
        {isWaiting ? '--:--' : formatted}
      </span>
      <span className="timer-label">{label}</span>
    </div>
  );
};
