/**
 * File System Access API & Directory Handle persistence helper.
 * Provides client-side local directory access for Chrome/Chromium,
 * with graceful fallback to browser downloads for Firefox and environments without directory picker.
 */

const DB_NAME = 'tab_audio_recorder_db';
const DB_VERSION = 1;
const STORE_NAME = 'file_handles';
const HANDLE_KEY = 'save_directory_handle';

/**
 * Checks if the browser supports the File System Access API (showDirectoryPicker).
 * Supported in Chrome/Chromium 86+. Not supported in Firefox.
 */
export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
  );
}

/**
 * Opens the IndexedDB database used to persist FileSystemDirectoryHandle.
 */
function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not available'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open handle database'));
    };
  });
}

/**
 * Stores a FileSystemDirectoryHandle in IndexedDB.
 */
export async function storeDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(handle, HANDLE_KEY);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Failed to store directory handle'));
  });
}

/**
 * Retrieves the stored FileSystemDirectoryHandle from IndexedDB, if any.
 */
export async function getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) {
    return null;
  }

  try {
    const db = await openHandleDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(HANDLE_KEY);

      req.onsuccess = () => {
        resolve(req.result ? (req.result as FileSystemDirectoryHandle) : null);
      };
      req.onerror = () => {
        reject(req.error || new Error('Failed to load directory handle'));
      };
    });
  } catch (err) {
    console.warn('[fileSystem] Could not retrieve stored directory handle:', err);
    return null;
  }
}

/**
 * Removes the stored directory handle from IndexedDB.
 */
export async function clearStoredDirectoryHandle(): Promise<void> {
  try {
    const db = await openHandleDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(HANDLE_KEY);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to clear directory handle'));
    });
  } catch (err) {
    console.warn('[fileSystem] Error clearing directory handle:', err);
  }
}

/**
 * Checks and optionally requests readwrite permission on a directory handle.
 */
export async function verifyDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  requestIfNeeded: boolean = true
): Promise<boolean> {
  try {
    const handleWithPermission = handle as unknown as {
      queryPermission: (opts: { mode: string }) => Promise<PermissionState>;
      requestPermission: (opts: { mode: string }) => Promise<PermissionState>;
    };

    if (typeof handleWithPermission.queryPermission !== 'function') {
      return true;
    }

    const currentStatus = await handleWithPermission.queryPermission({ mode: 'readwrite' });
    if (currentStatus === 'granted') {
      return true;
    }

    if (requestIfNeeded && typeof handleWithPermission.requestPermission === 'function') {
      const requestedStatus = await handleWithPermission.requestPermission({ mode: 'readwrite' });
      return requestedStatus === 'granted';
    }

    return false;
  } catch (err) {
    console.warn('[fileSystem] Error checking directory permission:', err);
    return false;
  }
}

/**
 * Prompts the user to pick a folder using the File System Access API.
 * Stores the chosen handle in IndexedDB upon selection.
 */
export async function promptDirectoryPicker(): Promise<{
  handle: FileSystemDirectoryHandle;
  folderName: string;
}> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API is not supported in this browser.');
  }

  const pickerFn = (window as unknown as {
    showDirectoryPicker: (opts?: { mode?: string; id?: string }) => Promise<FileSystemDirectoryHandle>;
  }).showDirectoryPicker;

  const handle = await pickerFn({ mode: 'readwrite', id: 'tab-audio-recordings' });
  const hasPermission = await verifyDirectoryPermission(handle, true);
  if (!hasPermission) {
    throw new Error('Permission to write to the chosen directory was denied.');
  }

  await storeDirectoryHandle(handle);
  return {
    handle,
    folderName: handle.name || 'Selected Folder',
  };
}

/**
 * Finds a unique filename in the directory to prevent overwriting existing files.
 * E.g., if "Track.mp3" exists, tries "Track (1).mp3", "Track (2).mp3", etc.
 */
export async function getUniqueFileHandle(
  dirHandle: FileSystemDirectoryHandle,
  desiredFilename: string
): Promise<{ fileHandle: FileSystemFileHandle; finalFilename: string }> {
  const lastDot = desiredFilename.lastIndexOf('.');
  const baseName = lastDot > 0 ? desiredFilename.substring(0, lastDot) : desiredFilename;
  const ext = lastDot > 0 ? desiredFilename.substring(lastDot) : '';

  let candidate = desiredFilename;
  let counter = 1;

  while (counter < 200) {
    try {
      // Check if candidate already exists
      await dirHandle.getFileHandle(candidate, { create: false });
      // If we got here, file exists, try next candidate
      candidate = `${baseName} (${counter})${ext}`;
      counter++;
    } catch (err) {
      // NotFoundError means the filename is available
      if ((err as Error).name === 'NotFoundError') {
        const fileHandle = await dirHandle.getFileHandle(candidate, { create: true });
        return { fileHandle, finalFilename: candidate };
      }
      // Re-throw if it's another error (e.g. security/permission)
      throw err;
    }
  }

  // Fallback after 200 attempts
  const fallbackName = `${baseName}-${Date.now()}${ext}`;
  const fileHandle = await dirHandle.getFileHandle(fallbackName, { create: true });
  return { fileHandle, finalFilename: fallbackName };
}

/**
 * Saves a Blob directly to a directory handle with duplicate-name avoidance.
 */
export async function saveBlobToDirectory(
  dirHandle: FileSystemDirectoryHandle,
  desiredFilename: string,
  blob: Blob
): Promise<{ savedFilename: string }> {
  const { fileHandle, finalFilename } = await getUniqueFileHandle(dirHandle, desiredFilename);

  type WritableHandle = FileSystemFileHandle & {
    createWritable: () => Promise<FileSystemWritableFileStream>;
  };

  const writable = await (fileHandle as WritableHandle).createWritable();
  await writable.write(blob);
  await writable.close();

  return { savedFilename: finalFilename };
}

export interface AutoSaveResult {
  success: boolean;
  filename: string;
  method: 'directory' | 'downloads' | 'anchor';
  folderName?: string;
  error?: string;
}

/**
 * Performs automatic saving of an audio blob.
 * First tries the user-selected local directory (Chrome/Chromium).
 * If directory access is not available (e.g., Firefox, or no folder chosen yet),
 * uses browser direct download (`saveAs: false`) without opening unnecessary dialogs.
 */
export async function saveRecordingAuto(
  blob: Blob,
  desiredFilename: string,
  dirHandle?: FileSystemDirectoryHandle | null,
  folderName?: string
): Promise<AutoSaveResult> {
  // 1. Attempt File System Access direct save if handle exists
  let targetHandle = dirHandle;
  if (!targetHandle && isFileSystemAccessSupported()) {
    targetHandle = await getStoredDirectoryHandle();
  }

  if (targetHandle) {
    const hasPerm = await verifyDirectoryPermission(targetHandle, false);
    if (hasPerm) {
      try {
        const { savedFilename } = await saveBlobToDirectory(targetHandle, desiredFilename, blob);
        return {
          success: true,
          filename: savedFilename,
          method: 'directory',
          folderName: targetHandle.name || folderName,
        };
      } catch (err) {
        console.warn('[fileSystem] Direct directory save failed, attempting downloads fallback:', err);
      }
    }
  }

  // 2. Direct browser downloads fallback (Firefox or Chromium without directory handle)
  // saveAs: false ensures no unnecessary dialog opens when supported
  try {
    if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
      const url = URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        chrome.downloads.download(
          {
            url,
            filename: desiredFilename,
            saveAs: false,
          },
          (downloadId) => {
            if (chrome.runtime.lastError || !downloadId) {
              const err = chrome.runtime.lastError?.message || 'Download initialization failed';
              reject(new Error(err));
            } else {
              resolve();
            }
            setTimeout(() => URL.revokeObjectURL(url), 30000);
          }
        );
      });

      return {
        success: true,
        filename: desiredFilename,
        method: 'downloads',
        folderName: 'Downloads',
      };
    }
  } catch (err) {
    console.warn('[fileSystem] chrome.downloads fallback failed:', err);
  }

  // 3. Fallback anchor tag download
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = desiredFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    return {
      success: true,
      filename: desiredFilename,
      method: 'anchor',
      folderName: 'Downloads',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      filename: desiredFilename,
      method: 'anchor',
      error: msg,
    };
  }
}
