import { ExternalLink, Maximize2 } from 'lucide-react';
import React from 'react';

import type { FeedStatus } from '../bridge/useAgentTubeFeed';

const STATUS_STYLE: Record<FeedStatus, { dot: string; label: string }> = {
  connecting: { dot: 'bg-amber-400', label: 'Connecting' },
  live: { dot: 'bg-emerald-400', label: 'Live' },
  offline: { dot: 'bg-rose-500', label: 'Offline' }
};

interface HeaderProps {
  feedStatus: FeedStatus;
  feedError: string | null;
}

const Header: React.FC<HeaderProps> = ({ feedStatus, feedError }) => {
  const status = STATUS_STYLE[feedStatus];

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
    } else {
      void document.exitFullscreen?.();
    }
  };

  return (
    <header className="h-14 border-b border-zinc-100 flex items-center justify-between px-6 bg-white shrink-0 relative z-40">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-7 h-7 rounded-lg bg-darkDelegation flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </span>
          <div className="leading-tight">
            <strong className="block text-[13px] font-black tracking-tight text-zinc-800">
              AgentTube Studio
            </strong>
            <span className="block text-[9px] font-medium uppercase tracking-[0.12em] text-zinc-400">
              Read-only pipeline view
            </span>
          </div>
        </div>

        <div
          className="flex items-center gap-1.5 shrink-0"
          title={feedError ?? 'Polling /api/dashboard'}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            {status.label}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Every action that changes channel state lives in the original dashboard,
            behind its review, rights and publishing gates. */}
        <a
          href="/"
          className="flex items-center gap-2 px-3 py-1 bg-darkDelegation text-white rounded-lg transition-all shadow-lg shadow-black/10 active:scale-95 h-9 shrink-0"
          title="Approve, schedule and publish in the operator console"
        >
          <ExternalLink size={14} />
          <span className="text-[10px] font-black uppercase tracking-wider hidden sm:inline">
            Operator console
          </span>
        </a>

        <div className="w-px h-4 bg-zinc-200" />

        {/* CC BY-NC 4.0 attribution for the 3D models — see ../../LICENSE */}
        <a
          href="https://unboring.net"
          target="_blank"
          rel="noopener"
          className="text-[10px] font-medium text-zinc-400 hover:text-darkDelegation transition-colors truncate"
          title="3D office and characters by Arturo Paracuellos, CC BY-NC 4.0"
        >
          3D by unboring.net
        </a>

        <button
          onClick={handleFullscreen}
          className="text-zinc-400 hover:text-darkDelegation transition-colors p-1"
          title="Fullscreen"
        >
          <Maximize2 size={16} />
        </button>
      </div>
    </header>
  );
};

export default Header;
