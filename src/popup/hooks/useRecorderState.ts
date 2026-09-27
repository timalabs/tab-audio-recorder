import { useEffect, useState, useCallback, useRef } from 'react';
import { browserApi } from '../../platform/browser.ts';
import {
  AutoStartDebugInfo,
  ExtensionMessage,
  INITIAL_RECORDER_STATE,
  RecorderState,
  TabInfo,
} from '../../recorder/RecorderState.ts';
import { isRestrictedUrl } from '../../utils/errors.ts';
import { DEFAULT_SETTINGS, loadSettings, RecorderSettings, saveSettings } from '../../utils/settings.ts';

export function useRecorderState() {
  const [state, setState] = useState<RecorderState>({ ...INITIAL_RECORDER_STATE });
  const [currentTab, setCurrentTab] = useState<TabInfo | null>(null);
  const [liveElapsedMs, setLiveElapsedMs] = useState<number>(0);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [currentDb, setCurrentDb] = useState<number | undefined>(undefined);
  const [debugInfo, setDebugInfo] = useState<AutoStartDebugInfo | undefined>(undefined);
  const [settings, setSettingsState] = useState<RecorderSettings>({ ...DEFAULT_SETTINGS });
  const timerRef = useRef<number | null>(null);

  // Load current active tab info and persistent settings
  useEffect(() => {
    browserApi.getActiveTab().then((tab) => {
      setCurrentTab(tab);
    });

    loadSettings().then((loaded) => {
      setSettingsState(loaded);
    });
  }, []);

  // Request state from background on initial popup render
  const syncState = useCallback(async () => {
    try {
      const bgState = await browserApi.sendMessage<RecorderState>({ type: 'GET_STATE' });
      if (bgState) {
        setState(bgState);
        if (bgState.settings) {
          setSettingsState(bgState.settings);
        }
        if (bgState.currentDb !== undefined) {
          setCurrentDb(bgState.currentDb);
        }
        if (bgState.debugInfo) {
          setDebugInfo(bgState.debugInfo);
        }
        if (bgState.status === 'RECORDING' && bgState.startedAt) {
          setLiveElapsedMs(Date.now() - bgState.startedAt);
        } else {
          setLiveElapsedMs(bgState.elapsedMs || 0);
        }
      }
    } catch (err) {
      console.warn('[useRecorderState] Failed to query background state:', err);
    }
  }, []);

  useEffect(() => {
    syncState();

    // Listen for state changes and audio levels from background / offscreen
    const cleanupListener = browserApi.addMessageListener((msg: ExtensionMessage) => {
      if (msg.type === 'STATE_CHANGED' && msg.state) {
        setState(msg.state);
        if (msg.state.settings) {
          setSettingsState(msg.state.settings);
        }
        if (msg.state.currentDb !== undefined) {
          setCurrentDb(msg.state.currentDb);
        }
        if (msg.state.debugInfo) {
          setDebugInfo(msg.state.debugInfo);
        }
        if (msg.state.status === 'RECORDING' && msg.state.startedAt) {
          setLiveElapsedMs(Date.now() - msg.state.startedAt);
        } else {
          setLiveElapsedMs(msg.state.elapsedMs || 0);
        }
      } else if (msg.type === 'AUDIO_LEVEL') {
        setAudioLevel(msg.level);
        if (msg.db !== undefined) {
          setCurrentDb(msg.db);
        }
        if (msg.debugInfo) {
          setDebugInfo(msg.debugInfo);
        }
      }
    });

    return () => {
      cleanupListener();
    };
  }, [syncState]);

  // Precise interval timer while in RECORDING state
  useEffect(() => {
    if (state.status === 'RECORDING') {
      const updateTimer = () => {
        if (state.startedAt) {
          setLiveElapsedMs(Math.max(0, Date.now() - state.startedAt));
        }
      };
      updateTimer();
      timerRef.current = window.setInterval(updateTimer, 200);
    } else {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (state.status !== 'WAITING_FOR_AUDIO' && state.status !== 'AUDIO_DETECTED') {
        setAudioLevel(0);
        setCurrentDb(undefined);
      }
    }

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state.status, state.startedAt]);

  const updateSettings = useCallback(async (newSettings: Partial<RecorderSettings>) => {
    const updated = await saveSettings(newSettings);
    setSettingsState(updated);
    try {
      await browserApi.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: updated,
      });
    } catch {
      // background might be dormant
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (currentTab?.url && isRestrictedUrl(currentTab.url)) {
      setState((prev) => ({
        ...prev,
        status: 'ERROR',
        errorMessage: 'This page cannot be recorded by browser extensions.',
      }));
      return;
    }

    setState((prev) => ({ ...prev, status: 'STARTING', errorMessage: undefined }));
    try {
      const res = await browserApi.sendMessage<{ success: boolean; error?: string }>({
        type: 'START_RECORDING',
        tabId: currentTab?.id,
        settings,
      });
      if (res && !res.success) {
        setState((prev) => ({
          ...prev,
          status: 'ERROR',
          errorMessage: res.error || 'Failed to start recording.',
        }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        status: 'ERROR',
        errorMessage: msg,
      }));
    }
  }, [currentTab, settings]);

  const stopRecording = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'STOPPING' }));
    try {
      await browserApi.sendMessage({ type: 'STOP_RECORDING' });
    } catch (err) {
      console.error('[useRecorderState] Error stopping recording:', err);
    }
  }, []);

  const resetRecording = useCallback(async () => {
    try {
      await browserApi.sendMessage({ type: 'RESET_RECORDING' });
    } catch (err) {
      console.error('[useRecorderState] Error resetting recording:', err);
    }
    setState({ ...INITIAL_RECORDER_STATE });
    setLiveElapsedMs(0);
    setAudioLevel(0);
  }, []);

  const downloadRecording = useCallback(async () => {
    try {
      await browserApi.sendMessage({ type: 'DOWNLOAD_RECORDING' });
    } catch (err) {
      console.error('[useRecorderState] Error triggering download:', err);
    }
  }, []);

  const forceRecord = useCallback(async () => {
    try {
      await browserApi.sendMessage({ type: 'FORCE_RECORD' });
    } catch (err) {
      console.error('[useRecorderState] Error forcing record:', err);
    }
  }, []);

  return {
    state,
    currentTab,
    liveElapsedMs,
    audioLevel,
    currentDb,
    debugInfo,
    settings,
    updateSettings,
    startRecording,
    stopRecording,
    resetRecording,
    downloadRecording,
    forceRecord,
  };
}
