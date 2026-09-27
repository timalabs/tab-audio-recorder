import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onRetry }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
      <div className="error-banner" role="alert" aria-live="assertive">
        <AlertCircle size={18} />
        <div>{message}</div>
      </div>

      <button className="btn btn-secondary" onClick={onRetry} aria-label="Retry recording">
        <RefreshCw size={16} />
        <span>Try Again</span>
      </button>
    </div>
  );
};
