import React from 'react';
import { Circle, Square, Loader2 } from 'lucide-react';
import { RecordingStatus } from '../../recorder/RecorderState.ts';

interface RecordingControlsProps {
  status: RecordingStatus;
  onStart: () => void;
  onStop: () => void;
}

export const RecordingControls: React.FC<RecordingControlsProps> = ({
  status,
  onStart,
  onStop,
}) => {
  if (status === 'STARTING') {
    return (
      <div className="button-group">
        <button className="btn btn-record" disabled aria-busy="true">
          <Loader2 size={16} className="animate-spin" />
          <span>Starting capture...</span>
        </button>
      </div>
    );
  }

  if (status === 'RECORDING') {
    return (
      <div className="button-group">
        <button
          className="btn btn-stop"
          onClick={onStop}
          aria-label="Stop recording tab audio"
          autoFocus
        >
          <Square size={16} fill="currentColor" />
          <span>Stop Recording</span>
        </button>
      </div>
    );
  }

  if (status === 'STOPPING') {
    return (
      <div className="button-group">
        <button className="btn btn-secondary" disabled aria-busy="true">
          <Loader2 size={16} className="animate-spin" />
          <span>Finalizing audio...</span>
        </button>
      </div>
    );
  }

  if (status === 'IDLE') {
    return (
      <div className="button-group">
        <button
          className="btn btn-record"
          onClick={onStart}
          aria-label="Start recording active browser tab"
          autoFocus
        >
          <Circle size={16} fill="currentColor" />
          <span>Start Recording</span>
        </button>
      </div>
    );
  }

  return null;
};
