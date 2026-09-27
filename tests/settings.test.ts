import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseDurationInput,
  formatDurationInput,
  loadSettings,
  saveSettings,
} from '../src/utils/settings.ts';

describe('Settings and Duration Input Parsing', () => {
  describe('parseDurationInput', () => {
    it('should parse MM:SS formats accurately', () => {
      expect(parseDurationInput('03:42')).toBe((3 * 60 + 42) * 1000); // 222000
      expect(parseDurationInput('00:45')).toBe(45000);
      expect(parseDurationInput('01:30')).toBe(90000);
      expect(parseDurationInput('05:00')).toBe(300000);
      expect(parseDurationInput('10:00')).toBe(600000);
    });

    it('should parse HH:MM:SS formats accurately', () => {
      expect(parseDurationInput('01:32:45')).toBe((1 * 3600 + 32 * 60 + 45) * 1000);
      expect(parseDurationInput('00:01:30')).toBe(90000);
    });

    it('should parse plain numeric seconds', () => {
      expect(parseDurationInput('45')).toBe(45000);
      expect(parseDurationInput('120')).toBe(120000);
    });

    it('should return undefined for empty, whitespace, or invalid inputs', () => {
      expect(parseDurationInput('')).toBeUndefined();
      expect(parseDurationInput('   ')).toBeUndefined();
      expect(parseDurationInput(undefined)).toBeUndefined();
      expect(parseDurationInput('abc')).toBeUndefined();
      expect(parseDurationInput('12:99')).toBeUndefined(); // seconds >= 60
      expect(parseDurationInput('-01:30')).toBeUndefined();
    });
  });

  describe('formatDurationInput', () => {
    it('should format milliseconds to MM:SS string', () => {
      expect(formatDurationInput(222000)).toBe('03:42');
      expect(formatDurationInput(45000)).toBe('00:45');
      expect(formatDurationInput(90000)).toBe('01:30');
      expect(formatDurationInput(300000)).toBe('05:00');
    });

    it('should format hours into HH:MM:SS string', () => {
      expect(formatDurationInput(5565000)).toBe('01:32:45');
    });

    it('should return empty string for undefined, 0, or negative values', () => {
      expect(formatDurationInput(undefined)).toBe('');
      expect(formatDurationInput(0)).toBe('');
      expect(formatDurationInput(-5000)).toBe('');
    });
  });

  describe('Storage Persistence', () => {
    const memoryStorage: Record<string, string> = {};

    beforeEach(() => {
      for (const k in memoryStorage) delete memoryStorage[k];

      (globalThis as unknown as { localStorage: unknown }).localStorage = {
        getItem: vi.fn((key: string) => memoryStorage[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          memoryStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete memoryStorage[key];
        }),
        clear: vi.fn(),
      };
    });

    it('should return default settings when storage is empty', async () => {
      const settings = await loadSettings();
      expect(settings.trimSilence).toBe(true);
      expect(settings.expectedDurationMs).toBeUndefined();
      expect(settings.outputFormat).toBe('mp3');
    });

    it('should save and reload custom settings', async () => {
      await saveSettings({
        trimSilence: false,
        expectedDurationMs: 180000,
        outputFormat: 'wav',
      });

      const loaded = await loadSettings();
      expect(loaded.trimSilence).toBe(false);
      expect(loaded.expectedDurationMs).toBe(180000);
      expect(loaded.outputFormat).toBe('wav');
    });

    it('should preserve existing settings on partial updates', async () => {
      await saveSettings({ expectedDurationMs: 222000, outputFormat: 'flac' });
      let loaded = await loadSettings();
      expect(loaded.trimSilence).toBe(true);
      expect(loaded.expectedDurationMs).toBe(222000);
      expect(loaded.outputFormat).toBe('flac');

      await saveSettings({ trimSilence: false });
      loaded = await loadSettings();
      expect(loaded.trimSilence).toBe(false);
      expect(loaded.expectedDurationMs).toBe(222000);
      expect(loaded.outputFormat).toBe('flac');
    });
  });
});
