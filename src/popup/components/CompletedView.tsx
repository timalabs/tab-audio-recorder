import React from 'react';
import { CheckCircle2, Download, Plus } from 'lucide-react';
import { RecordingResult } from '../../recorder/RecorderState.ts';
import { formatBytes } from '../../utils/formatters.ts';
import { formatDuration } from '../../utils/time.ts';

interface CompletedViewProps {
  result?: RecordingResult;
  onDownload: () => void;
  onNewRecording: () => void;
}

export const CompletedView: React.FC<CompletedViewProps> = ({
  result,
  onDownload,
  onNewRecording,
}) => {
  if (!result) return null;

  return (
    <div className="completed-card" role="region" aria-label="Recording completed details">
      <div className="completed-title">
        <CheckCircle2 size={18} color="var(--accent-green)" />
        <span>Recording Complete</span>
      </div>

      <div className="completed-grid">
        <div className="completed-item">
          <span className="completed-label">Duration</span>
          <span className="completed-value">{formatDuration(result.durationMs)}</span>
        </div>

        <div className="completed-item">
          <span className="completed-label">Size</span>
          <span className="completed-value">{formatBytes(result.sizeBytes)}</span>
        </div>

        <div className="completed-item">
          <span className="completed-label">Format</span>
          <span className="completed-value">{result.mimeType}</span>
        </div>

        <div className="completed-item">
          <span className="completed-label">Storage</span>
          <span className="completed-value">Local Only</span>
        </div>

        <div className="completed-filename" title={result.filename}>
          {result.filename}
        </div>
      </div>

      <div className="button-group" style={{ marginTop: '8px' }}>
        <button
          className="btn btn-download"
          onClick={onDownload}
          aria-label={`Download audio recording file ${result.filename}`}
          autoFocus
        >
          <Download size={16} />
          <span>Download</span>
        </button>

        <button
          className="btn btn-secondary"
          onClick={onNewRecording}
          aria-label="Start a new recording session"
        >
          <Plus size={16} />
          <span>New Recording</span>
        </button>
      </div>
    </div>
  );
};
