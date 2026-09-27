import { describe, it, expect } from 'vitest';
import {
  INITIAL_RECORDER_STATE,
  RecorderState,
} from '../src/recorder/RecorderState.ts';

describe('Recorder State Transitions', () => {
  it('should initialize in IDLE state with 0 elapsedMs', () => {
    expect(INITIAL_RECORDER_STATE.status).toBe('IDLE');
    expect(INITIAL_RECORDER_STATE.elapsedMs).toBe(0);
    expect(INITIAL_RECORDER_STATE.startedAt).toBeUndefined();
    expect(INITIAL_RECORDER_STATE.result).toBeUndefined();
  });

  it('should transition through valid recording lifecycles', () => {
    let state: RecorderState = { ...INITIAL_RECORDER_STATE };

    // Transition to STARTING
    state = {
      ...state,
      status: 'STARTING',
      tabInfo: { id: 10, title: 'Demo Page', domain: 'example.com' },
    };
    expect(state.status).toBe('STARTING');
    expect(state.tabInfo?.domain).toBe('example.com');

    // Transition to RECORDING
    const startedAt = Date.now();
    state = {
      ...state,
      status: 'RECORDING',
      startedAt,
    };
    expect(state.status).toBe('RECORDING');
    expect(state.startedAt).toBe(startedAt);

    // Transition to STOPPING
    state = {
      ...state,
      status: 'STOPPING',
    };
    expect(state.status).toBe('STOPPING');

    // Transition to COMPLETED
    state = {
      ...state,
      status: 'COMPLETED',
      result: {
        durationMs: 42000,
        sizeBytes: 1048576,
        mimeType: 'WebM / Opus',
        filename: 'Demo-Page-2026-09-27-21-45-12.webm',
        tabTitle: 'Demo Page',
        domain: 'example.com',
      },
    };
    expect(state.status).toBe('COMPLETED');
    expect(state.result?.sizeBytes).toBe(1048576);
    expect(state.result?.durationMs).toBe(42000);

    // Transition to ERROR
    state = {
      ...state,
      status: 'ERROR',
      errorMessage: 'This page cannot be recorded by browser extensions.',
    };
    expect(state.status).toBe('ERROR');
    expect(state.errorMessage).toContain('cannot be recorded');
  });
});
