import { Users } from 'lucide-react';
import React from 'react';
import { AgenticSystem, getAllAgents } from '../../data/agents';

interface TeamBadgeProps {
  system: AgenticSystem;
}

export const TeamBadge: React.FC<TeamBadgeProps> = ({ system }) => {
  const agentCount = getAllAgents(system).length;

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-9 px-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-black/5"
        style={{ backgroundColor: system.color }}
      >
        <Users size={14} className="text-white opacity-90" strokeWidth={3} />
        <span className="text-xs font-black text-white leading-none">
          {agentCount}
        </span>
      </div>
      <div className="flex flex-col items-start">
        <span className="text-sm font-black text-darkDelegation leading-tight">
          {system.teamName}
        </span>
        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest leading-tight">
          {system.teamType}
        </span>
      </div>
    </div>
  );
};
