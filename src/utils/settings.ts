import { AudioFormat, DEFAULT_FORMAT } from '../audio/conversion/formats.ts';

export interface RecorderSettings {
  trimSilence: boolean;
  expectedDurationMs?: number;
  outputFormat: AudioFormat;

  autoStartRecording: boolean;
  autoStartThresholdDb: number;
  autoStartMinSoundDurationMs: number;
  autoStartPreRollMs: number;

  autoSave: boolean;
  saveFolderName?: string;
}

export const DEFAULT_SETTINGS: RecorderSettings = {
  trimSilence: true,
  expectedDurationMs: undefined,
  outputFormat: DEFAULT_FORMAT,

  autoStartRecording: false,
  autoStartThresholdDb: -48,
  autoStartMinSoundDurationMs: 400,
  autoStartPreRollMs: 700,

  autoSave: false,
  saveFolderName: undefined,
};

const STORAGE_KEY = 'tab_audio_recorder_settings';

/**
 * Loads recorder settings from browser-local storage with fallback to localStorage.
 */
export async function loadSettings(): Promise<RecorderSettings> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          if (chrome.runtime.lastError || !result || !result[STORAGE_KEY]) {
            return resolve(loadFromLocalStorage());
          }
          const stored = result[STORAGE_KEY];
          resolve({
            ...DEFAULT_SETTINGS,
            ...stored,
            outputFormat: stored.outputFormat || DEFAULT_SETTINGS.outputFormat,
            autoStartRecording: stored.autoStartRecording ?? DEFAULT_SETTINGS.autoStartRecording,
            autoStartThresholdDb: stored.autoStartThresholdDb ?? DEFAULT_SETTINGS.autoStartThresholdDb,
            autoStartMinSoundDurationMs: stored.autoStartMinSoundDurationMs ?? DEFAULT_SETTINGS.autoStartMinSoundDurationMs,
            autoStartPreRollMs: stored.autoStartPreRollMs ?? DEFAULT_SETTINGS.autoStartPreRollMs,
            autoSave: stored.autoSave ?? DEFAULT_SETTINGS.autoSave,
            saveFolderName: stored.saveFolderName ?? DEFAULT_SETTINGS.saveFolderName,
          });
        });
      });
    }
  } catch (err) {
    console.warn('[settings] Error accessing chrome.storage.local:', err);
  }

  return loadFromLocalStorage();
}

/**
 * Saves recorder settings to browser-local storage and localStorage.
 */
export async function saveSettings(settings: Partial<RecorderSettings>): Promise<RecorderSettings> {
  const current = await loadSettings();
  const updated: RecorderSettings = {
    ...current,
    ...settings,
  };

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: updated }, () => {
          resolve();
        });
      });
    }
  } catch (err) {
    console.warn('[settings] Error saving to chrome.storage.local:', err);
  }

  saveToLocalStorage(updated);
  return updated;
}

function loadFromLocalStorage(): RecorderSettings {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          outputFormat: parsed.outputFormat || DEFAULT_SETTINGS.outputFormat,
          autoStartRecording: parsed.autoStartRecording ?? DEFAULT_SETTINGS.autoStartRecording,
          autoStartThresholdDb: parsed.autoStartThresholdDb ?? DEFAULT_SETTINGS.autoStartThresholdDb,
          autoStartMinSoundDurationMs: parsed.autoStartMinSoundDurationMs ?? DEFAULT_SETTINGS.autoStartMinSoundDurationMs,
          autoStartPreRollMs: parsed.autoStartPreRollMs ?? DEFAULT_SETTINGS.autoStartPreRollMs,
          autoSave: parsed.autoSave ?? DEFAULT_SETTINGS.autoSave,
          saveFolderName: parsed.saveFolderName ?? DEFAULT_SETTINGS.saveFolderName,
        };
      }
    }
  } catch (err) {
    console.warn('[settings] Error reading localStorage:', err);
  }
  return { ...DEFAULT_SETTINGS };
}

function saveToLocalStorage(settings: RecorderSettings): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  } catch (err) {
    console.warn('[settings] Error writing to localStorage:', err);
  }
}

/**
 * Parses a user input string into milliseconds.
 * Supports: "MM:SS" (e.g., "03:42"), "HH:MM:SS" (e.g., "01:30:00"), or plain seconds ("45").
 * Returns undefined for empty or invalid input.
 */
export function parseDurationInput(raw?: string): number | undefined {
  if (!raw) return undefined;
  const clean = raw.trim();
  if (!clean) return undefined;

  const parts = clean.split(':').map((p) => p.trim());

  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    if (!isNaN(minutes) && !isNaN(seconds) && minutes >= 0 && seconds >= 0 && seconds < 60) {
      const totalMs = (minutes * 60 + seconds) * 1000;
      return totalMs > 0 ? totalMs : undefined;
    }
  } else if (parts.length === 3) {
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    if (
      !isNaN(hours) &&
      !isNaN(minutes) &&
      !isNaN(seconds) &&
      hours >= 0 &&
      minutes >= 0 &&
      minutes < 60 &&
      seconds >= 0 &&
      seconds < 60
    ) {
      const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
      return totalMs > 0 ? totalMs : undefined;
    }
  } else if (parts.length === 1) {
    const seconds = parseInt(parts[0], 10);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }

  return undefined;
}

/**
 * Formats milliseconds into "MM:SS" or "HH:MM:SS" for user input display.
 */
export function formatDurationInput(ms?: number): string {
  if (!ms || ms <= 0 || !isFinite(ms)) return '';

  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}
