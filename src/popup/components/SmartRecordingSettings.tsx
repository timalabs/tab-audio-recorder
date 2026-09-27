import React, { useState, useEffect } from 'react';
import { Sliders } from 'lucide-react';
import { formatDurationInput, parseDurationInput, RecorderSettings } from '../../utils/settings.ts';

interface SmartRecordingSettingsProps {
  settings: RecorderSettings;
  onUpdateSettings: (newSettings: Partial<RecorderSettings>) => void;
  disabled?: boolean;
}

export const SmartRecordingSettings: React.FC<SmartRecordingSettingsProps> = ({
  settings,
  onUpdateSettings,
  disabled = false,
}) => {
  const [durationStr, setDurationStr] = useState<string>(
    formatDurationInput(settings.expectedDurationMs)
  );

  useEffect(() => {
    setDurationStr(formatDurationInput(settings.expectedDurationMs));
  }, [settings.expectedDurationMs]);

  const handleToggleTrim = () => {
    if (disabled) return;
    onUpdateSettings({
      trimSilence: !settings.trimSilence,
    });
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDurationStr(val);
    const parsedMs = parseDurationInput(val);
    onUpdateSettings({
      expectedDurationMs: parsedMs,
    });
  };

  const handleDurationBlur = () => {
    // Reformat nicely on blur if valid
    const parsedMs = parseDurationInput(durationStr);
    setDurationStr(formatDurationInput(parsedMs));
    onUpdateSettings({
      expectedDurationMs: parsedMs,
    });
  };

  const isTrimmingOn = settings.trimSilence;

  return (
    <div className="smart-settings-card" role="region" aria-label="Smart recording settings">
      <div className="smart-settings-header">
        <div className="smart-settings-title">
          <Sliders size={14} className="text-secondary" />
          <span>Smart recording</span>
        </div>
      </div>

      {/* Row 1: Trim Silence Toggle */}
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Trim silence</span>
          <span className="settings-hint">Removes leading & trailing silence</span>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isTrimmingOn}
          className={`toggle-btn ${isTrimmingOn ? 'active' : ''}`}
          onClick={handleToggleTrim}
          disabled={disabled}
          aria-label={`Trim silence: currently ${isTrimmingOn ? 'ON' : 'OFF'}`}
        >
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-text">{isTrimmingOn ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Row 2: Track Duration Input */}
      <div className={`settings-row ${!isTrimmingOn || disabled ? 'row-disabled' : ''}`}>
        <div className="settings-label-group">
          <label htmlFor="track-duration-input" className="settings-label">
            Track duration
          </label>
          <span className="settings-hint">
            {isTrimmingOn
              ? 'Optional — helps preserve silence inside track'
              : 'Disabled (trimming is OFF)'}
          </span>
        </div>

        <div className="duration-input-wrapper">
          <input
            id="track-duration-input"
            type="text"
            className="duration-input"
            placeholder="03:42"
            value={durationStr}
            onChange={handleDurationChange}
            onBlur={handleDurationBlur}
            disabled={!isTrimmingOn || disabled}
            maxLength={8}
            aria-label="Expected track duration in MM:SS"
          />
        </div>
      </div>
    </div>
  );
};
