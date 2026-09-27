import React, { useState, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  Download,
  Plus,
  Scissors,
  X,
  FileAudio,
  AlertCircle,
  Check,
} from 'lucide-react';
import { RecordingResult } from '../../recorder/RecorderState.ts';
import {
  AudioFormat,
  SUPPORTED_FORMATS,
  getFormatInfo,
  DEFAULT_FORMAT,
} from '../../audio/conversion/formats.ts';
import { convertAudio } from '../../audio/conversion/AudioConverter.ts';
import { formatBytes } from '../../utils/formatters.ts';
import { formatDuration } from '../../utils/time.ts';
import { RecorderSettings } from '../../utils/settings.ts';

interface ConvertedFile {
  blob: Blob;
  filename: string;
  sizeBytes: number;
}

interface CompletedViewProps {
  result?: RecordingResult;
  settings?: RecorderSettings;
  onUpdateSettings?: (newSettings: Partial<RecorderSettings>) => void;
  onDownload?: () => void;
  onNewRecording: () => void;
}

function getConvertedFilename(originalFilename: string, newExtension: string): string {
  const dotIndex = originalFilename.lastIndexOf('.');
  if (dotIndex > 0) {
    return `${originalFilename.substring(0, dotIndex)}.${newExtension}`;
  }
  return `${originalFilename}.${newExtension}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
    chrome.downloads.download(
      {
        url,
        filename,
        saveAs: true,
      },
      () => {
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    );
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

export const CompletedView: React.FC<CompletedViewProps> = ({
  result,
  settings,
  onUpdateSettings,
  onDownload,
  onNewRecording,
}) => {
  const initialFormat = settings?.outputFormat || DEFAULT_FORMAT;
  const [selectedFormat, setSelectedFormat] = useState<AudioFormat>(initialFormat);
  const [convertedMap, setConvertedMap] = useState<Partial<Record<AudioFormat, ConvertedFile>>>({});
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [conversionProgress, setConversionProgress] = useState<number>(0);
  const [conversionError, setConversionError] = useState<string | null>(null);

  const abortRef = useRef<boolean>(false);

  // Sync format with settings if settings change
  useEffect(() => {
    if (settings?.outputFormat) {
      setSelectedFormat(settings.outputFormat);
    }
  }, [settings?.outputFormat]);

  if (!result) return null;

  const currentFormatInfo = getFormatInfo(selectedFormat);
  const currentConverted = convertedMap[selectedFormat];
  const isAlreadyConverted = Boolean(currentConverted);
  const targetFilename = getConvertedFilename(result.filename, currentFormatInfo.extension);

  const handleFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFormat = e.target.value as AudioFormat;
    setSelectedFormat(newFormat);
    setConversionError(null);
    if (onUpdateSettings) {
      onUpdateSettings({ outputFormat: newFormat });
    }
  };

  const fetchMasterBlob = async (): Promise<Blob> => {
    if (result.blobUrl) {
      const res = await fetch(result.blobUrl);
      if (!res.ok) {
        throw new Error(`Failed to read recorded audio data (${res.statusText})`);
      }
      return await res.blob();
    }
    if (result.dataUrl) {
      const res = await fetch(result.dataUrl);
      if (!res.ok) {
        throw new Error('Failed to parse recorded audio data');
      }
      return await res.blob();
    }
    throw new Error('No recorded audio data available');
  };

  const handleConvertAndDownload = async () => {
    // If already converted, download directly
    if (currentConverted) {
      triggerDownload(currentConverted.blob, currentConverted.filename);
      return;
    }

    setIsConverting(true);
    setConversionProgress(0);
    setConversionError(null);
    abortRef.current = false;

    try {
      const masterBlob = await fetchMasterBlob();

      const converted = await convertAudio(masterBlob, {
        targetFormat: selectedFormat,
        bitrateKbps: 192,
        onProgress: (percent) => setConversionProgress(percent),
        isAborted: () => abortRef.current,
      });

      const newConverted: ConvertedFile = {
        blob: converted.blob,
        filename: targetFilename,
        sizeBytes: converted.sizeBytes,
      };

      setConvertedMap((prev) => ({
        ...prev,
        [selectedFormat]: newConverted,
      }));

      // Trigger user download
      triggerDownload(converted.blob, targetFilename);
    } catch (err) {
      if (abortRef.current) {
        setConversionError('Conversion was cancelled.');
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setConversionError(msg);
      }
    } finally {
      setIsConverting(false);
    }
  };

  const handleCancelConversion = () => {
    abortRef.current = true;
    setIsConverting(false);
  };

  const handleSelectConvertedChip = (fmt: AudioFormat) => {
    setSelectedFormat(fmt);
    const item = convertedMap[fmt];
    if (item) {
      triggerDownload(item.blob, item.filename);
    }
  };

  const originalMs = result.originalDurationMs;
  const trimmedMs = result.durationMs;
  const savedMs = originalMs && originalMs > trimmedMs ? originalMs - trimmedMs : 0;

  const currentDisplaySize = currentConverted ? currentConverted.sizeBytes : result.sizeBytes;
  const currentDisplayFilename = currentConverted ? currentConverted.filename : targetFilename;

  return (
    <div className="completed-card" role="region" aria-label="Recording completed details">
      <div className="completed-title">
        <CheckCircle2 size={18} color="var(--accent-green)" />
        <span>Recording Complete</span>
        {result.trimmed && (
          <span className="smart-trimmed-badge" title="Silence trimmed at beginning and end">
            <Scissors size={11} />
            <span>Trimmed</span>
          </span>
        )}
      </div>

      <div className="completed-grid">
        {/* Duration details: Original vs Trimmed */}
        {result.trimmed && originalMs ? (
          <>
            <div className="completed-item">
              <span className="completed-label">Original Duration</span>
              <span className="completed-value">{formatDuration(originalMs)}</span>
            </div>
            <div className="completed-item">
              <span className="completed-label">Trimmed Duration</span>
              <span className="completed-value text-accent">
                {formatDuration(trimmedMs)}
                {savedMs > 0 && <span className="duration-saved-tag">(-{formatDuration(savedMs)})</span>}
              </span>
            </div>
          </>
        ) : (
          <div className="completed-item">
            <span className="completed-label">Duration</span>
            <span className="completed-value">{formatDuration(result.durationMs)}</span>
          </div>
        )}

        <div className="completed-item">
          <span className="completed-label">Size</span>
          <span className="completed-value">{formatBytes(currentDisplaySize)}</span>
        </div>

        <div className="completed-item">
          <span className="completed-label">Silence Trim</span>
          <span className="completed-value">
            {result.trimmed ? 'Start/End Trimmed' : 'Untouched'}
          </span>
        </div>

        <div className="completed-filename" title={currentDisplayFilename}>
          {currentDisplayFilename}
        </div>
      </div>

      {/* Format Conversion Section */}
      <div className="conversion-section">
        <div className="format-selector-row">
          <div className="format-selector-label-group">
            <label htmlFor="format-select" className="format-label">
              <FileAudio size={14} className="text-secondary" />
              <span>Output format</span>
            </label>
            <span className="format-desc">{currentFormatInfo.description}</span>
          </div>

          <div className="select-wrapper">
            <select
              id="format-select"
              className="format-dropdown"
              value={selectedFormat}
              onChange={handleFormatChange}
              disabled={isConverting}
              aria-label="Select audio output format"
            >
              {SUPPORTED_FORMATS.map((fmt) => (
                <option key={fmt.id} value={fmt.id}>
                  {fmt.label} {fmt.id === 'mp3' ? '(Default)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Converted formats badges / history */}
        {Object.keys(convertedMap).length > 0 && (
          <div className="converted-chips-row" aria-label="Already generated audio formats">
            <span className="chips-label">Generated:</span>
            {SUPPORTED_FORMATS.filter((f) => Boolean(convertedMap[f.id])).map((f) => (
              <button
                key={f.id}
                type="button"
                className={`format-chip ${f.id === selectedFormat ? 'active' : ''}`}
                onClick={() => handleSelectConvertedChip(f.id)}
                title={`Download ${f.label} (${formatBytes(convertedMap[f.id]!.sizeBytes)})`}
              >
                <Check size={11} />
                <span>{f.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Non-blocking Conversion Progress */}
        {isConverting && (
          <div className="conversion-progress-box" role="status" aria-live="polite">
            <div className="progress-info-row">
              <span className="progress-status-text">
                Converting audio... {currentFormatInfo.label}
              </span>
              <span className="progress-percent-text">{conversionProgress}%</span>
            </div>
            <div className="progress-track" aria-hidden="true">
              <div
                className="progress-fill"
                style={{ width: `${Math.max(4, conversionProgress)}%` }}
              />
            </div>
            <div className="progress-actions">
              <button
                type="button"
                className="btn-cancel-conversion"
                onClick={handleCancelConversion}
                aria-label="Cancel audio conversion"
              >
                <X size={12} />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        )}

        {/* Error notice if conversion failed */}
        {conversionError && (
          <div className="conversion-error-box" role="alert">
            <AlertCircle size={14} className="text-error" />
            <div className="conversion-error-content">
              <span>{conversionError}</span>
              {onDownload && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={onDownload}
                  style={{ display: 'block', marginTop: '4px' }}
                >
                  Download raw recording ({result.mimeType})
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Action Buttons */}
      <div className="button-group" style={{ marginTop: '10px' }}>
        <button
          type="button"
          className="btn btn-download"
          onClick={handleConvertAndDownload}
          disabled={isConverting}
          aria-label={
            isAlreadyConverted
              ? `Download ${currentFormatInfo.label}`
              : `Convert and download as ${currentFormatInfo.label}`
          }
          autoFocus
        >
          <Download size={16} />
          <span>
            {isAlreadyConverted
              ? `Download ${currentFormatInfo.label}`
              : `Convert & Download (${currentFormatInfo.label})`}
          </span>
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onNewRecording}
          disabled={isConverting}
          aria-label="Start a new recording session"
        >
          <Plus size={16} />
          <span>New Recording</span>
        </button>
      </div>
    </div>
  );
};
