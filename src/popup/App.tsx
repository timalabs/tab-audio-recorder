import React from 'react';
import { Header } from './components/Header.tsx';
import { TabInfoCard } from './components/TabInfoCard.tsx';
import { TimerDisplay } from './components/TimerDisplay.tsx';
import { AudioVisualizer } from './components/AudioVisualizer.tsx';
import { RecordingControls } from './components/RecordingControls.tsx';
import { CompletedView } from './components/CompletedView.tsx';
import { ErrorBanner } from './components/ErrorBanner.tsx';
import { SmartRecordingSettings } from './components/SmartRecordingSettings.tsx';
import { useRecorderState } from './hooks/useRecorderState.ts';
import '../styles/popup.css';

export const App: React.FC = () => {
  const {
    state,
    currentTab,
    liveElapsedMs,
    audioLevel,
    settings,
    updateSettings,
    startRecording,
    stopRecording,
    resetRecording,
    downloadRecording,
  } = useRecorderState();

  const isCompleted = state.status === 'COMPLETED';
  const isError = state.status === 'ERROR';
  const isRecordingActive =
    state.status === 'RECORDING' ||
    state.status === 'STARTING' ||
    state.status === 'STOPPING';

  return (
    <div className="popup-container">
      <Header />

      <TabInfoCard
        tabInfo={state.tabInfo || currentTab}
        status={state.status}
      />

      {isError ? (
        <div className="center-stage">
          <ErrorBanner
            message={state.errorMessage || 'Audio capture could not be initiated.'}
            onRetry={resetRecording}
          />
        </div>
      ) : isCompleted ? (
        <CompletedView
          result={state.result}
          settings={settings}
          onUpdateSettings={updateSettings}
          onDownload={downloadRecording}
          onNewRecording={resetRecording}
        />
      ) : (
        <>
          <div className="center-stage">
            <TimerDisplay
              elapsedMs={liveElapsedMs}
              isRecording={state.status === 'RECORDING'}
            />
            <AudioVisualizer
              level={audioLevel}
              active={state.status === 'RECORDING'}
            />
          </div>

          <SmartRecordingSettings
            settings={settings}
            onUpdateSettings={updateSettings}
            disabled={isRecordingActive}
          />

          <RecordingControls
            status={state.status}
            onStart={startRecording}
            onStop={stopRecording}
          />
        </>
      )}
    </div>
  );
};
