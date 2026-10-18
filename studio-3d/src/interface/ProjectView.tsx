import { ExternalLink } from 'lucide-react';
import React from 'react';

import { useCoreStore } from '../integration/store/coreStore';
import { useActiveTeam } from '../integration/store/teamStore';

const PHASE_COPY = {
  idle: {
    label: 'Idle',
    detail: 'No generation job is running. The office goes about its day.'
  },
  working: {
    label: 'Producing',
    detail: 'A video is moving through the pipeline. Watch the agents take their desks.'
  },
  done: {
    label: 'Delivered',
    detail: 'A production just finished.'
  }
} as const;

/** Shown in the inspector when no character is selected. */
const ProjectView: React.FC = () => {
  const { phase, tasks } = useCoreStore();
  const system = useActiveTeam();

  const phaseCopy = PHASE_COPY[phase];
  const working = tasks.filter((task) => task.status === 'in_progress');
  const blocked = tasks.filter((task) => task.status === 'on_hold');
  const done = tasks.filter((task) => task.status === 'done');
  const awaitingYou = blocked.filter((task) => task.requiresUserApproval);

  return (
    <div className="flex flex-col h-full p-6 gap-6 overflow-y-auto">
      <div>
        <h2 className="text-xl font-black text-darkDelegation leading-tight">{system.teamName}</h2>
        <p className="text-[11px] text-zinc-500 leading-relaxed font-medium mt-1">
          {system.teamDescription}
        </p>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Pipeline</p>
          <div className="h-px flex-1 bg-zinc-100" />
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              phase === 'working'
                ? 'bg-emerald-400 animate-pulse'
                : phase === 'done'
                  ? 'bg-yellow-400'
                  : 'bg-zinc-300'
            }`}
          />
          <span className="text-sm font-bold text-darkDelegation">{phaseCopy.label}</span>
        </div>
        <p className="text-[11px] text-zinc-500 leading-relaxed font-medium mt-1.5">
          {phaseCopy.detail}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Working', value: working.length },
          { label: 'Done', value: done.length },
          { label: 'Blocked', value: blocked.length }
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2.5"
          >
            <p className="text-lg font-black text-darkDelegation leading-none font-mono">
              {stat.value}
            </p>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mt-1">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {awaitingYou.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-col gap-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
            {awaitingYou.length} waiting on you
          </p>
          <p className="text-[12px] font-bold text-darkDelegation leading-snug">
            {awaitingYou[0].title}
          </p>
          <a
            href="/"
            className="flex items-center justify-center gap-2 bg-darkDelegation hover:bg-black active:scale-95 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
          >
            <ExternalLink size={13} strokeWidth={3} />
            Open operator console
          </a>
        </div>
      )}

      <p className="text-[10px] text-zinc-400 leading-relaxed font-medium mt-auto">
        This view only reads state. Approving, scheduling and publishing stay in the operator
        console, behind their review and rights gates.
      </p>
    </div>
  );
};

export default ProjectView;
