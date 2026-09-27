import React, { useState } from 'react';
import { Globe, Music } from 'lucide-react';
import { RecordingStatus, TabInfo } from '../../recorder/RecorderState.ts';

interface TabInfoCardProps {
  tabInfo?: TabInfo | null;
  status: RecordingStatus;
}

export const TabInfoCard: React.FC<TabInfoCardProps> = ({ tabInfo, status }) => {
  const [faviconError, setFaviconError] = useState(false);

  const title = tabInfo?.title || 'Unknown Tab';
  const domain = tabInfo?.domain || 'Current Tab';
  const hasFavicon = tabInfo?.favIconUrl && !faviconError;

  return (
    <div className="tab-info-card" role="region" aria-label="Current tab information">
      <div className="tab-icon-wrapper" aria-hidden="true">
        {hasFavicon ? (
          <img
            src={tabInfo.favIconUrl}
            alt=""
            className="tab-favicon"
            onError={() => setFaviconError(true)}
          />
        ) : domain.includes('music') || domain.includes('audio') || domain.includes('sound') ? (
          <Music size={18} className="text-secondary" />
        ) : (
          <Globe size={18} className="text-secondary" />
        )}
      </div>

      <div className="tab-info-content">
        <div className="tab-title" title={title}>
          {title}
        </div>
        <div className="tab-domain" title={domain}>
          {domain}
        </div>
      </div>

      <div className="status-pill">
        {status === 'RECORDING' ? (
          <>
            <span className="status-dot recording" aria-hidden="true" />
            <span style={{ color: 'var(--accent-red)' }}>Recording</span>
          </>
        ) : (
          <>
            <span className="status-dot ready" aria-hidden="true" />
            <span style={{ color: 'var(--accent-green)' }}>Ready</span>
          </>
        )}
      </div>
    </div>
  );
};
