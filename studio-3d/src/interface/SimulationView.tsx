import { Maximize2, Minimize2 } from 'lucide-react';
import React from 'react';

import { useActiveTeam } from '../integration/store/teamStore';
import { useUiStore } from '../integration/store/uiStore';
import InspectorPanel from './InspectorPanel';
import UIOverlay from './UIOverlay';
import { TeamBadge } from './components/TeamBadge';

interface SimulationViewProps {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  isFullscreen: boolean;
  setIsFullscreen: (value: boolean) => void;
}

/** The 3D models are fetched on demand, so "not downloaded yet" is a normal state. */
const SceneErrorPanel: React.FC<{ detail: string }> = ({ detail }) => (
  <div className="absolute inset-0 z-20 flex items-center justify-center p-8 bg-white/80 backdrop-blur-sm">
    <div className="max-w-md text-center">
      <h3 className="text-lg font-black text-darkDelegation tracking-tight">
        The 3D assets are not installed
      </h3>
      <p className="text-[13px] text-zinc-500 leading-relaxed font-medium mt-3">
        The office and characters are licensed CC BY-NC 4.0 by{' '}
        <a
          href="https://unboring.net"
          target="_blank"
          rel="noopener"
          className="underline decoration-zinc-300 underline-offset-2 hover:text-darkDelegation"
        >
          unboring.net
        </a>{' '}
        and are not distributed with AgentTube. Fetch them for non-commercial use:
      </p>
      <pre className="mt-4 px-4 py-3 bg-zinc-900 text-zinc-100 rounded-xl text-[11px] font-mono text-left overflow-x-auto">
        npm run studio:assets
      </pre>
      <p className="text-[11px] text-zinc-400 leading-relaxed font-medium mt-4">
        Then rebuild with <code className="font-mono">npm run studio:build</code>. Everything
        else — the pipeline, the agents, the dashboard — works without them.
      </p>
      <p className="text-[10px] text-zinc-300 font-mono mt-4 break-words">{detail}</p>
    </div>
  </div>
);

const SimulationView: React.FC<SimulationViewProps> = ({
  canvasRef,
  isFullscreen,
  setIsFullscreen
}) => {
  const selectedNpcIndex = useUiStore((state) => state.selectedNpcIndex);
  const sceneError = useUiStore((state) => state.sceneError);
  const activeSet = useActiveTeam();

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 relative">
      <div className="h-14 border-b border-black/5 flex items-center justify-between px-5 bg-white shrink-0">
        <div className="flex-1 flex items-center gap-4 px-2.5">
          <TeamBadge system={activeSet} />
        </div>

        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 text-zinc-400 hover:text-darkDelegation transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Panel'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      <div ref={canvasRef} className="flex-1 min-h-0 relative overflow-hidden bg-black/5">
        {sceneError ? <SceneErrorPanel detail={sceneError} /> : <UIOverlay />}
        {isFullscreen && selectedNpcIndex !== null && (
          <div className="absolute top-4 right-4 bottom-4 w-96 z-50 pointer-events-none flex flex-col gap-4">
            <InspectorPanel isFloating />
          </div>
        )}
      </div>
    </div>
  );
};

export default SimulationView;
