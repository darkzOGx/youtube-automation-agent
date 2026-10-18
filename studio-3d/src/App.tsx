import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useAgentTubeFeed } from './bridge/useAgentTubeFeed';
import { useCoreStore } from './integration/store/coreStore';
import { ActionLogPanel } from './interface/ActionLogPanel';
import Header from './interface/Header';
import InspectorPanel from './interface/InspectorPanel';
import { KanbanPanel } from './interface/KanbanPanel';
import SimulationView from './interface/SimulationView';
import { SceneContext } from './simulation/SceneContext';
import { SceneManager } from './simulation/SceneManager';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<SceneManager | null>(null);
  const [sceneManager, setSceneManager] = useState<SceneManager | null>(null);
  const { isLogOpen, isKanbanOpen, setIsResizing } = useCoreStore();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [kanbanHeight, setKanbanHeight] = useState(220);

  // Writes AgentTube's real job state into the store the simulation reads.
  const feed = useAgentTubeFeed();

  const stopResizing = useCallback(() => setIsResizing(false), [setIsResizing]);

  const resize = useCallback((e: MouseEvent) => {
    if (useCoreStore.getState().isResizing) {
      const windowHeight = window.innerHeight;
      const newHeight = windowHeight - e.clientY;
      if (newHeight >= windowHeight * 0.2 && newHeight <= windowHeight * 0.5) {
        setKanbanHeight(newHeight);
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  useEffect(() => {
    if (canvasRef.current && !managerRef.current) {
      const manager = new SceneManager(canvasRef.current);
      managerRef.current = manager;
      setSceneManager(manager);
    }

    return () => {
      if (managerRef.current) {
        managerRef.current.dispose();
        managerRef.current = null;
        setSceneManager(null);
      }
    };
  }, []);

  return (
    <SceneContext.Provider value={sceneManager}>
      <div className="w-screen h-screen bg-white overflow-hidden flex flex-col">
        {!isFullscreen && <Header feedStatus={feed.status} feedError={feed.error} />}

        <div className="flex-1 flex flex-row min-h-0 min-w-0 overflow-hidden">
          {isLogOpen && !isFullscreen && <ActionLogPanel />}

          <div className="relative flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-zinc-50">
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              <SimulationView
                canvasRef={canvasRef}
                isFullscreen={isFullscreen}
                setIsFullscreen={setIsFullscreen}
              />

              {isKanbanOpen && !isFullscreen && (
                <div
                  className="h-2 bg-transparent hover:bg-zinc-200 border-t border-black/5 transition-colors cursor-row-resize z-30 flex items-center justify-center group shrink-0"
                  onMouseDown={() => setIsResizing(true)}
                >
                  <div className="w-12 h-1 bg-zinc-300 rounded-full group-hover:bg-zinc-400" />
                </div>
              )}

              {isKanbanOpen && !isFullscreen && <KanbanPanel height={kanbanHeight} />}
            </div>
          </div>

          {!isFullscreen && <InspectorPanel />}
        </div>
      </div>
    </SceneContext.Provider>
  );
};

export default App;
