import React, { useState } from 'react';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { AutoStartDebugInfo, RecordingStatus } from '../../recorder/RecorderState.ts';

interface AutoStartDiagnosticsProps {
  currentDb?: number;
  debugInfo?: AutoStartDebugInfo;
  status: RecordingStatus;
  autoStartEnabled: boolean;
}

export const AutoStartDiagnostics: React.FC<AutoStartDiagnosticsProps> = ({
  currentDb,
  debugInfo,
  status,
  autoStartEnabled,
}) => {
  const isWaitingOrDetected = status === 'WAITING_FOR_AUDIO' || status === 'AUDIO_DETECTED';
  const [showDetails, setShowDetails] = useState<boolean>(true);

  if (!autoStartEnabled && !isWaitingOrDetected) {
    return null;
  }

  // Format dB display
  let formattedDb = '-∞ dB';
  const dbVal = currentDb !== undefined ? currentDb : debugInfo?.db;
  if (dbVal !== undefined && dbVal > -90) {
    formattedDb = `${dbVal.toFixed(1)} dB`;
  }

  const isAbove = debugInfo?.aboveThreshold ?? false;
  const isRunning = debugInfo?.audioContextState === 'running';

  return (
    <div className="autostart-diag-card" role="region" aria-label="Audio Detection Diagnostics">
      {/* Real-time Level Banner */}
      <div className="autostart-diag-header">
        <div className="autostart-diag-title">
          <Activity size={14} className={isAbove ? 'text-accent' : 'text-secondary'} />
          <span>Auto-start: <strong>ON</strong></span>
        </div>
        <button
          type="button"
          className="diag-toggle-btn"
          onClick={() => setShowDetails(!showDetails)}
          title="Toggle diagnostic details"
        >
          <span>Diagnostics</span>
          {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      <div className="autostart-level-row">
        <span className="diag-meta-label">Audio level:</span>
        <span className={`diag-level-val ${isAbove ? 'level-above' : ''}`}>
          {formattedDb}
        </span>
      </div>

      {debugInfo?.isCalibrating && (
        <div className="diag-calibrating-note">
          Calibrating ambient level...
        </div>
      )}

      {/* Detailed Diagnostic Panel */}
      {showDetails && (
        <div className="diagnostics-panel">
          <div className="diag-grid">
            <div className="diag-item">
              <span className="diag-k">Capture:</span>
              <span className={`diag-v ${debugInfo?.streamActive ? 'v-ok' : 'v-warn'}`}>
                {debugInfo?.streamActive ? 'OK' : 'Inactive'}
              </span>
            </div>

            <div className="diag-item">
              <span className="diag-k">Audio tracks:</span>
              <span className="diag-v">
                {debugInfo?.audioTracksCount ?? 0} ({debugInfo?.trackReadyState ?? 'none'}, {debugInfo?.trackMuted ? 'muted' : 'unmuted'})
              </span>
            </div>

            <div className="diag-item">
              <span className="diag-k">AudioContext:</span>
              <span className={`diag-v ${isRunning ? 'v-ok' : 'v-err'}`}>
                {debugInfo?.audioContextState ?? 'none'}
              </span>
            </div>

            <div className="diag-item">
              <span className="diag-k">Analyser:</span>
              <span className={`diag-v ${debugInfo?.analyserActive ? 'v-ok' : 'v-warn'}`}>
                {debugInfo?.analyserActive ? 'active' : 'inactive'}
              </span>
            </div>

            <div className="diag-item">
              <span className="diag-k">RMS:</span>
              <span className="diag-v font-mono">
                {debugInfo?.rms !== undefined ? debugInfo.rms.toFixed(5) : '0.00000'}
              </span>
            </div>

            <div className="diag-item">
              <span className="diag-k">dB:</span>
              <span className="diag-v font-mono">{formattedDb}</span>
            </div>

            <div className="diag-item">
              <span className="diag-k">Threshold:</span>
              <span className="diag-v font-mono">{debugInfo?.thresholdDb ?? -48} dB</span>
            </div>

            <div className="diag-item">
              <span className="diag-k">Above threshold:</span>
              <span className={`diag-v font-bold ${isAbove ? 'v-ok' : 'v-muted'}`}>
                {isAbove ? 'YES' : 'NO'}
              </span>
            </div>

            <div className="diag-item">
              <span className="diag-k">Detection timer:</span>
              <span className="diag-v font-mono">{debugInfo?.detectionTimerMs ?? 0} ms</span>
            </div>

            {debugInfo?.noiseFloorDb !== undefined && (
              <div className="diag-item">
                <span className="diag-k">Noise floor:</span>
                <span className="diag-v font-mono">{debugInfo.noiseFloorDb} dB</span>
              </div>
            )}

            <div className="diag-item">
              <span className="diag-k">State:</span>
              <span className="diag-v font-mono v-state">{status}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
