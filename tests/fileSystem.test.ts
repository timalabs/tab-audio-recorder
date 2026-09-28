import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isFileSystemAccessSupported,
  getUniqueFileHandle,
  saveBlobToDirectory,
  saveRecordingAuto,
} from '../src/utils/fileSystem.ts';

describe('fileSystem and Auto-save Utility Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('isFileSystemAccessSupported', () => {
    it('should return true when window.showDirectoryPicker is available', () => {
      (globalThis as unknown as { window: unknown }).window = {
        showDirectoryPicker: vi.fn(),
      };
      expect(isFileSystemAccessSupported()).toBe(true);
    });

    it('should return false when window.showDirectoryPicker is undefined (Firefox/Safari)', () => {
      (globalThis as unknown as { window: unknown }).window = {};
      expect(isFileSystemAccessSupported()).toBe(false);
    });
  });

  describe('getUniqueFileHandle - Duplicate name avoidance', () => {
    it('should return original name if no file exists with that name', async () => {
      const existingFiles = new Set<string>();

      const mockDirHandle = {
        name: 'Recordings',
        getFileHandle: vi.fn((name: string, opts?: { create?: boolean }) => {
          if (opts?.create) {
            existingFiles.add(name);
            return Promise.resolve({ name } as FileSystemFileHandle);
          }
          if (existingFiles.has(name)) {
            return Promise.resolve({ name } as FileSystemFileHandle);
          }
          const err = new Error('File not found');
          err.name = 'NotFoundError';
          return Promise.reject(err);
        }),
      } as unknown as FileSystemDirectoryHandle;

      const { finalFilename } = await getUniqueFileHandle(mockDirHandle, 'My-Track.mp3');
      expect(finalFilename).toBe('My-Track.mp3');
    });

    it('should append (1), (2) when duplicate filenames already exist in directory', async () => {
      const existingFiles = new Set<string>(['My-Track.mp3', 'My-Track (1).mp3']);

      const mockDirHandle = {
        name: 'Recordings',
        getFileHandle: vi.fn((name: string, opts?: { create?: boolean }) => {
          if (opts?.create) {
            existingFiles.add(name);
            return Promise.resolve({ name } as FileSystemFileHandle);
          }
          if (existingFiles.has(name)) {
            return Promise.resolve({ name } as FileSystemFileHandle);
          }
          const err = new Error('File not found');
          err.name = 'NotFoundError';
          return Promise.reject(err);
        }),
      } as unknown as FileSystemDirectoryHandle;

      const { finalFilename } = await getUniqueFileHandle(mockDirHandle, 'My-Track.mp3');
      expect(finalFilename).toBe('My-Track (2).mp3');
    });
  });

  describe('saveBlobToDirectory', () => {
    it('should write blob data using FileSystemWritableFileStream and close', async () => {
      const writtenChunks: Blob[] = [];
      let streamClosed = false;

      const mockWritable = {
        write: vi.fn(async (chunk: Blob) => {
          writtenChunks.push(chunk);
        }),
        close: vi.fn(async () => {
          streamClosed = true;
        }),
      };

      const mockFileHandle = {
        name: 'Song.mp3',
        createWritable: vi.fn(async () => mockWritable),
      };

      const mockDirHandle = {
        name: 'Music',
        getFileHandle: vi.fn((_name: string, opts?: { create?: boolean }) => {
          if (!opts?.create) {
            const err = new Error('File not found');
            err.name = 'NotFoundError';
            return Promise.reject(err);
          }
          return Promise.resolve(mockFileHandle as unknown as FileSystemFileHandle);
        }),
      } as unknown as FileSystemDirectoryHandle;

      const blob = new Blob(['fake audio content'], { type: 'audio/mp3' });
      const result = await saveBlobToDirectory(mockDirHandle, 'Song.mp3', blob);

      expect(result.savedFilename).toBe('Song.mp3');
      expect(mockFileHandle.createWritable).toHaveBeenCalled();
      expect(mockWritable.write).toHaveBeenCalledWith(blob);
      expect(streamClosed).toBe(true);
    });
  });

  describe('saveRecordingAuto', () => {
    it('should save directly to directory handle when available and permission is granted', async () => {
      const mockWritable = {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const mockFileHandle = {
        name: 'Test-Track.wav',
        createWritable: vi.fn(async () => mockWritable),
      };

      const mockDirHandle = {
        name: 'Studio Folder',
        queryPermission: vi.fn().mockResolvedValue('granted'),
        getFileHandle: vi.fn((_name: string, opts?: { create?: boolean }) => {
          if (!opts?.create) {
            const err = new Error('Not found');
            err.name = 'NotFoundError';
            return Promise.reject(err);
          }
          return Promise.resolve(mockFileHandle as unknown as FileSystemFileHandle);
        }),
      } as unknown as FileSystemDirectoryHandle;

      const blob = new Blob(['wav audio bytes'], { type: 'audio/wav' });
      const res = await saveRecordingAuto(blob, 'Test-Track.wav', mockDirHandle);

      expect(res.success).toBe(true);
      expect(res.method).toBe('directory');
      expect(res.filename).toBe('Test-Track.wav');
      expect(res.folderName).toBe('Studio Folder');
    });

    it('should use chrome.downloads fallback with saveAs: false when directory handle is absent (Firefox)', async () => {
      let downloadOptions: chrome.downloads.DownloadOptions | null = null;

      (globalThis as unknown as { chrome: unknown }).chrome = {
        downloads: {
          download: vi.fn((options: chrome.downloads.DownloadOptions, cb?: (id: number) => void) => {
            downloadOptions = options;
            if (cb) cb(42);
          }),
        },
        runtime: {},
      };

      (globalThis as unknown as { URL: unknown }).URL = {
        createObjectURL: vi.fn(() => 'blob:mock-download-url'),
        revokeObjectURL: vi.fn(),
      };

      const blob = new Blob(['mp3 audio bytes'], { type: 'audio/mp3' });
      const res = await saveRecordingAuto(blob, 'Firefox-Track.mp3', null);

      expect(res.success).toBe(true);
      expect(res.method).toBe('downloads');
      expect(res.folderName).toBe('Downloads');
      expect(downloadOptions).not.toBeNull();
      expect((downloadOptions as unknown as { saveAs: boolean }).saveAs).toBe(false);
      expect((downloadOptions as unknown as { filename: string }).filename).toBe('Firefox-Track.mp3');
    });

    it('should save to subfolder in Downloads when folderName is provided', async () => {
      let downloadOptions: chrome.downloads.DownloadOptions | null = null;

      (globalThis as unknown as { chrome: unknown }).chrome = {
        downloads: {
          download: vi.fn((options: chrome.downloads.DownloadOptions, cb?: (id: number) => void) => {
            downloadOptions = options;
            if (cb) cb(43);
          }),
        },
        runtime: {},
      };

      const blob = new Blob(['mp3 audio bytes'], { type: 'audio/mp3' });
      const res = await saveRecordingAuto(blob, 'My-Track.mp3', null, 'Tab Audio Recorder');

      expect(res.success).toBe(true);
      expect(res.method).toBe('downloads');
      expect(res.folderName).toBe('Downloads / Tab Audio Recorder');
      expect(downloadOptions).not.toBeNull();
      expect((downloadOptions as unknown as { filename: string }).filename).toBe(
        'Tab Audio Recorder/My-Track.mp3'
      );
    });
  });
});
