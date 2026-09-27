import React from 'react';
import { Circle, Square, Loader2, Radio } from 'lucide-react';
import { RecordingStatus } from '../../recorder/RecorderState.ts';

interface RecordingControlsProps {
  status: RecordingStatus;
  autoStartEnabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  onForceRecord?: () => void;
}

export const RecordingControls: React.FC<RecordingControlsProps> = ({
  status,
  autoStartEnabled = false,
  onStart,
  onStop,
  onForceRecord,
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

  if (status === 'WAITING_FOR_AUDIO') {
    return (
      <div className="button-group">
        {onForceRecord && (
          <button
            type="button"
            className="btn btn-record"
            onClick={onForceRecord}
            aria-label="Force start recording immediately"
            title="Start recording immediately without waiting for sound threshold"
          >
            <Circle size={16} fill="currentColor" />
            <span>Record Now</span>
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onStop}
          aria-label="Cancel waiting for audio"
        >
          <Square size={16} fill="currentColor" />
          <span>Cancel Monitoring</span>
        </button>
      </div>
    );
  }

  if (status === 'AUDIO_DETECTED') {
    return (
      <div className="button-group">
        <button className="btn btn-record" disabled aria-busy="true">
          <Radio size={16} className="animate-pulse text-accent" />
          <span>Audio detected! Starting...</span>
        </button>
      </div>
    );
  }

  if (status === 'RECORDING') {
    return (
      <div className="button-group">
        <button
          type="button"
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
          type="button"
          className="btn btn-record"
          onClick={onStart}
          aria-label={autoStartEnabled ? 'Start waiting for audio' : 'Start recording active browser tab'}
          autoFocus
        >
          {autoStartEnabled ? (
            <>
              <Radio size={16} />
              <span>Wait for Audio</span>
            </>
          ) : (
            <>
              <Circle size={16} fill="currentColor" />
              <span>Start Recording</span>
            </>
          )}
        </button>
      </div>
    );
  }

  return null;
};
