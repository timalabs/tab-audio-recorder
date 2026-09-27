import React from 'react';

interface AudioVisualizerProps {
  level: number; // 0.0 to 1.0
  active: boolean;
}

const BAR_MULTIPLIERS = [0.4, 0.7, 1.0, 1.3, 0.9, 1.4, 1.1, 0.8, 0.6, 0.3];

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ level, active }) => {
  return (
    <div
      className="visualizer-container"
      role="meter"
      aria-label="Audio level meter"
      aria-valuenow={Math.round(level * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {BAR_MULTIPLIERS.map((multiplier, i) => {
        // Base minimum height 4px, up to 32px max based on level and frequency shape
        const scaledHeight = active
          ? Math.max(4, Math.min(32, Math.round(level * multiplier * 32)))
          : 4;

        return (
          <div
            key={i}
            className="visualizer-bar"
            style={{
              height: `${scaledHeight}px`,
              opacity: active ? (scaledHeight > 4 ? 0.95 : 0.4) : 0.25,
            }}
          />
        );
      })}
    </div>
  );
};
