import React from 'react';
import { Radio } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="header" role="banner">
      <div className="brand">
        <Radio className="brand-icon" aria-hidden="true" />
        <span>Tab Recorder</span>
      </div>
      <div className="local-badge" title="No cloud, no server. All processing is 100% local.">
        100% Local
      </div>
    </header>
  );
};
