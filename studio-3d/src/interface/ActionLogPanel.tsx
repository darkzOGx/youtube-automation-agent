import { Filter, Terminal } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { getAllAgents } from '../data/agents';
import { useCoreStore } from '../integration/store/coreStore';
import { useActiveTeam } from '../integration/store/teamStore';

function formatTime(ts: number): string {
  if (!ts) return '--:--:--';
  return new Date(ts).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Every stage AgentTube has run, newest first.
 *
 * Upstream this panel also showed raw LLM request/response traces; those live on the
 * server now, so this is purely the stage timeline derived from generation checkpoints.
 */
export const ActionLogPanel: React.FC = () => {
  const { setLogOpen, actionLog, logFilterAgentIndex } = useCoreStore();
  const system = useActiveTeam();
  const agents = getAllAgents(system);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(
    () =>
      (logFilterAgentIndex !== null
        ? actionLog.filter((entry) => entry.agentIndex === logFilterAgentIndex)
        : actionLog
      )
        .slice()
        .reverse(),
    [actionLog, logFilterAgentIndex]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [entries.length]);

  const filteredAgent =
    logFilterAgentIndex !== null
      ? agents.find((agent) => agent.index === logFilterAgentIndex) ?? null
      : null;

  return (
    <div className="w-[320px] h-full bg-white border-r border-zinc-100 flex flex-col pointer-events-auto overflow-hidden shrink-0 relative">
      <div className="h-14 px-4 border-b border-zinc-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal size={14} className="text-zinc-300 shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-darkDelegation">
            Activity
          </span>
          {filteredAgent && (
            <span
              className="text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded border leading-none truncate"
              style={{
                backgroundColor: `${filteredAgent.color}15`,
                color: filteredAgent.color,
                borderColor: `${filteredAgent.color}30`
              }}
            >
              {filteredAgent.name}
            </span>
          )}
        </div>

        <div className="relative shrink-0">
          <button
            onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
            className={`p-1.5 rounded transition-colors ${
              isFilterMenuOpen || logFilterAgentIndex !== null
                ? 'text-darkDelegation bg-zinc-100'
                : 'text-zinc-300 hover:text-zinc-600'
            }`}
            title="Filter by agent"
          >
            <Filter size={13} />
          </button>

          {isFilterMenuOpen && (
            <div className="absolute right-0 top-9 w-48 bg-white border border-zinc-100 rounded-xl shadow-xl py-1 z-50">
              <button
                onClick={() => {
                  setLogOpen(true, null);
                  setIsFilterMenuOpen(false);
                }}
                className={`w-full px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-zinc-50 transition-colors ${
                  logFilterAgentIndex === null ? 'text-darkDelegation' : 'text-zinc-400'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    logFilterAgentIndex === null
                      ? 'bg-darkDelegation'
                      : 'bg-transparent border border-zinc-200'
                  }`}
                />
                All agents
              </button>
              {agents.map((agent) => (
                <button
                  key={agent.index}
                  onClick={() => {
                    setLogOpen(true, agent.index);
                    setIsFilterMenuOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-zinc-50 transition-colors ${
                    logFilterAgentIndex === agent.index ? 'text-darkDelegation' : 'text-zinc-400'
                  }`}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        logFilterAgentIndex === agent.index ? agent.color : 'transparent',
                      border:
                        logFilterAgentIndex === agent.index ? 'none' : '1px solid #e4e4e7'
                    }}
                  />
                  <span className="truncate">{agent.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
        {entries.length === 0 ? (
          <p className="text-[11px] text-zinc-300 italic font-medium mt-2">
            Nothing yet. Queue a video in the operator console and the stages will appear here.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {entries.map((entry) => {
              const agent = agents.find((a) => a.index === entry.agentIndex);
              return (
                <li key={entry.id} className="flex items-start gap-2.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: agent?.color ?? '#d4d4d8' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-darkDelegation leading-snug">
                      <span className="font-black">{agent?.name ?? 'System'}</span>{' '}
                      <span className="font-medium text-zinc-500">{entry.action}</span>
                    </p>
                    <p className="text-[9px] font-mono text-zinc-300 mt-0.5">
                      {formatTime(entry.timestamp)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
};
