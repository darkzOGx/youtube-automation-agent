import React from 'react';

import { getAllAgents } from '../data/agents';
import { useCoreStore } from '../integration/store/coreStore';
import { useActiveTeam } from '../integration/store/teamStore';

interface AgentStatusPanelProps {
  agentIndex: number;
}

const AgentStatusPanel: React.FC<AgentStatusPanelProps> = ({ agentIndex }) => {
  const tasks = useCoreStore((state) => state.tasks);
  const system = useActiveTeam();
  const agent = getAllAgents(system).find((a) => a.index === agentIndex);

  if (!agent) return null;

  const mine = tasks.filter((task) => task.assignedAgentId === agentIndex);
  const activeTask = mine.find((task) => task.status === 'in_progress') ?? null;
  const blockedTask = mine.find((task) => task.status === 'on_hold') ?? null;
  const doneCount = mine.filter((task) => task.status === 'done').length;

  return (
    <div className="flex flex-col h-full p-6">
      <div className="mb-8 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Role</p>
            <div className="h-px flex-1 bg-zinc-100" />
          </div>
          <p className="text-xs text-zinc-600 leading-relaxed font-medium">{agent.description}</p>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
              Pipeline role
            </p>
            <div className="h-px flex-1 bg-zinc-100" />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-50 rounded-lg border border-zinc-100/60 font-mono">
            <p className="text-[11px] font-bold text-darkDelegation tracking-tighter">
              {agent.model}
            </p>
          </div>
        </div>
      </div>

      <div className="h-px bg-zinc-100 w-full mb-6" />

      {activeTask ? (
        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ backgroundColor: agent.color }}
              />
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ backgroundColor: agent.color }}
              />
            </span>
            Doing now
          </p>
          <p className="text-sm text-darkDelegation leading-snug font-bold">{activeTask.title}</p>
          {activeTask.description && (
            <p className="text-[11px] text-zinc-500 leading-relaxed font-medium mt-1.5">
              {activeTask.description}
            </p>
          )}
        </div>
      ) : blockedTask ? (
        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-rose-400 mb-2">
            Needs attention
          </p>
          <p className="text-sm text-darkDelegation leading-snug font-bold">{blockedTask.title}</p>
          {blockedTask.description && (
            <p className="text-[11px] text-zinc-500 leading-relaxed font-medium mt-1.5">
              {blockedTask.description}
            </p>
          )}
        </div>
      ) : (
        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400/50 mb-2">
            Status
          </p>
          <p className="text-sm text-zinc-300 leading-snug italic font-medium">
            Waiting for next task…
          </p>
        </div>
      )}

      {doneCount > 0 && (
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
          {doneCount} stage{doneCount === 1 ? '' : 's'} completed in this run
        </p>
      )}
    </div>
  );
};

export default AgentStatusPanel;
