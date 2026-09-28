import React, { useState, useEffect } from 'react';
import {
  Sliders,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Folder,
} from 'lucide-react';
import {
  formatDurationInput,
  parseDurationInput,
  RecorderSettings,
  DEFAULT_SETTINGS,
} from '../../utils/settings.ts';
import {
  isFileSystemAccessSupported,
  getStoredDirectoryHandle,
  verifyDirectoryPermission,
  promptDirectoryPicker,
} from '../../utils/fileSystem.ts';

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
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [folderName, setFolderName] = useState<string | undefined>(settings.saveFolderName);
  const [isCheckingFolder, setIsCheckingFolder] = useState<boolean>(false);

  useEffect(() => {
    setFolderName(settings.saveFolderName);
  }, [settings.saveFolderName]);

  useEffect(() => {
    let isMounted = true;
    async function checkFolder() {
      if (!isFileSystemAccessSupported()) {
        return;
      }
      setIsCheckingFolder(true);
      try {
        const handle = await getStoredDirectoryHandle();
        if (handle) {
          const hasPerm = await verifyDirectoryPermission(handle, false);
          if (isMounted && hasPerm) {
            setFolderName(handle.name || settings.saveFolderName);
            if (!settings.saveFolderName && handle.name) {
              onUpdateSettings({ saveFolderName: handle.name });
            }
          }
        }
      } catch {
        // Fallback to relative Downloads subfolder
      } finally {
        if (isMounted) {
          setIsCheckingFolder(false);
        }
      }
    }

    if (settings.autoSave) {
      checkFolder();
    }
    return () => {
      isMounted = false;
    };
  }, [settings.autoSave]);

  const handleChooseFolder = async () => {
    if (disabled) return;
    try {
      const { folderName: name } = await promptDirectoryPicker();
      setFolderName(name);
      onUpdateSettings({ saveFolderName: name });
    } catch (err) {
      console.warn('[SmartRecordingSettings] Directory picker error:', err);
    }
  };

  const handleFolderNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFolderName(val);
    onUpdateSettings({ saveFolderName: val });
  };

  useEffect(() => {
    setDurationStr(formatDurationInput(settings.expectedDurationMs));
  }, [settings.expectedDurationMs]);

  const handleToggleTrim = () => {
    if (disabled) return;
    onUpdateSettings({
      trimSilence: !settings.trimSilence,
    });
  };

  const handleToggleAutoStart = () => {
    if (disabled) return;
    onUpdateSettings({
      autoStartRecording: !settings.autoStartRecording,
    });
  };

  const handleToggleAutoSave = () => {
    if (disabled) return;
    onUpdateSettings({
      autoSave: !settings.autoSave,
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
    const parsedMs = parseDurationInput(durationStr);
    setDurationStr(formatDurationInput(parsedMs));
    onUpdateSettings({
      expectedDurationMs: parsedMs,
    });
  };

  const handleResetAdvanced = () => {
    if (disabled) return;
    onUpdateSettings({
      autoStartThresholdDb: DEFAULT_SETTINGS.autoStartThresholdDb,
      autoStartMinSoundDurationMs: DEFAULT_SETTINGS.autoStartMinSoundDurationMs,
      autoStartPreRollMs: DEFAULT_SETTINGS.autoStartPreRollMs,
    });
  };

  const isTrimmingOn = settings.trimSilence;
  const isAutoStartOn = settings.autoStartRecording;
  const isAutoSaveOn = settings.autoSave;

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

      {/* Dynamic Explanation Annotation */}
      <div className={`duration-annotation ${!isTrimmingOn ? 'annotation-disabled' : ''}`}>
        {!isTrimmingOn
          ? 'ⓘ Enable Trim silence to use track duration.'
          : (settings.expectedDurationMs && settings.expectedDurationMs > 0)
          ? 'ⓘ Silence within this duration will not be trimmed.'
          : 'ⓘ Optional. Helps detect the end of the track.'}
      </div>

      {/* Row 3: Auto-start Recording Toggle */}
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Auto-start recording</span>
          <span className="settings-hint">Starts when sound begins</span>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isAutoStartOn}
          className={`toggle-btn ${isAutoStartOn ? 'active' : ''}`}
          onClick={handleToggleAutoStart}
          disabled={disabled}
          aria-label={`Auto-start recording: currently ${isAutoStartOn ? 'ON' : 'OFF'}`}
        >
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-text">{isAutoStartOn ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Row 4: Auto-save Toggle */}
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Auto-save</span>
          <span className="settings-hint">Saves recording when track ends</span>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isAutoSaveOn}
          className={`toggle-btn ${isAutoSaveOn ? 'active' : ''}`}
          onClick={handleToggleAutoSave}
          disabled={disabled}
          aria-label={`Auto-save: currently ${isAutoSaveOn ? 'ON' : 'OFF'}`}
        >
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-text">{isAutoSaveOn ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Save Location (directly under Auto-save) */}
      {isAutoSaveOn && (
        <div className="save-location-container">
          <div className="save-location-header">
            <div className="save-location-title">
              <Folder size={12} className="text-secondary" />
              <span>Save location</span>
            </div>
            {isFileSystemAccessSupported() && (
              <button
                type="button"
                className="btn-folder-action"
                onClick={handleChooseFolder}
                disabled={disabled || isCheckingFolder}
                title="Select an external folder on your disk (Chrome/Chromium)"
              >
                Browse disk...
              </button>
            )}
          </div>

          <div
            className="folder-name-row"
            title="Subfolder inside your Downloads directory where recordings are saved"
          >
            <span className="folder-prefix">Downloads /</span>
            <input
              type="text"
              className="folder-name-input"
              value={folderName || ''}
              placeholder="Tab Audio Recorder"
              onChange={handleFolderNameChange}
              disabled={disabled}
              maxLength={40}
              aria-label="Subfolder name inside Downloads"
            />
          </div>

          <span className="save-location-hint">
            ⓘ Recordings will be saved into Downloads/{folderName || 'Tab Audio Recorder'}/.
          </span>
        </div>
      )}

      {/* Advanced Settings Accordion Toggle */}
      <div className="advanced-toggle-row">
        <button
          type="button"
          className="advanced-toggle-btn"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
        >
          <span>Advanced</span>
          {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Advanced Settings Panel */}
      {showAdvanced && (
        <div className="advanced-settings-panel">
          <div className="advanced-item">
            <div className="advanced-label-row">
              <label htmlFor="threshold-slider" className="advanced-label">
                Audio detection threshold
              </label>
              <span className="advanced-val">{settings.autoStartThresholdDb} dB</span>
            </div>
            <input
              id="threshold-slider"
              type="range"
              min="-60"
              max="-25"
              step="1"
              value={settings.autoStartThresholdDb}
              disabled={disabled}
              onChange={(e) =>
                onUpdateSettings({ autoStartThresholdDb: parseInt(e.target.value, 10) })
              }
              className="advanced-slider"
            />
            <span className="advanced-hint">Default: -48 dB (lower is more sensitive)</span>
          </div>

          <div className="advanced-item">
            <div className="advanced-label-row">
              <label htmlFor="mindur-input" className="advanced-label">
                Minimum sound duration
              </label>
              <span className="advanced-val">{settings.autoStartMinSoundDurationMs} ms</span>
            </div>
            <input
              id="mindur-input"
              type="range"
              min="100"
              max="1200"
              step="50"
              value={settings.autoStartMinSoundDurationMs}
              disabled={disabled}
              onChange={(e) =>
                onUpdateSettings({ autoStartMinSoundDurationMs: parseInt(e.target.value, 10) })
              }
              className="advanced-slider"
            />
            <span className="advanced-hint">Rejects spikes & clicks shorter than this</span>
          </div>

          <div className="advanced-item">
            <div className="advanced-label-row">
              <label htmlFor="preroll-input" className="advanced-label">
                Pre-roll buffer
              </label>
              <span className="advanced-val">{settings.autoStartPreRollMs} ms</span>
            </div>
            <input
              id="preroll-input"
              type="range"
              min="200"
              max="1500"
              step="50"
              value={settings.autoStartPreRollMs}
              disabled={disabled}
              onChange={(e) =>
                onUpdateSettings({ autoStartPreRollMs: parseInt(e.target.value, 10) })
              }
              className="advanced-slider"
            />
            <span className="advanced-hint">Preserves opening attack before detection</span>
          </div>

          <div className="advanced-reset-row">
            <button
              type="button"
              className="advanced-reset-btn"
              onClick={handleResetAdvanced}
              disabled={disabled}
              title="Reset advanced settings to default values"
            >
              <RotateCcw size={11} />
              <span>Reset defaults</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
