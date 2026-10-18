import { ExternalLink, MessageSquareWarning } from 'lucide-react';
import React from 'react';

import { getAllCharacters } from '../data/agents';
import { useCoreStore } from '../integration/store/coreStore';
import { useActiveTeam } from '../integration/store/teamStore';
import { useUiStore } from '../integration/store/uiStore';
import AgentStatusPanel from './AgentStatusPanel';
import ProjectView from './ProjectView';
import { Avatar } from './components/Avatar';

interface InspectorPanelProps {
  isFloating?: boolean;
}

const InspectorPanel: React.FC<InspectorPanelProps> = ({ isFloating }) => {
  const selectedNpcIndex = useUiStore((state) => state.selectedNpcIndex);
  const tasks = useCoreStore((state) => state.tasks);
  const system = useActiveTeam();

  const agent =
    selectedNpcIndex !== null
      ? getAllCharacters(system).find((a) => a.index === selectedNpcIndex) ?? null
      : null;

  const isUser = agent?.index === system.user.index;
  const isLead = agent?.index === system.leadAgent.index;
  const tasksOnHold = agent
    ? tasks.filter((task) => task.assignedAgentId === agent.index && task.status === 'on_hold')
    : [];

  return (
    <div
      className={`${
        isFloating
          ? 'w-full h-full max-h-[85vh] self-end rounded-2xl shadow-2xl border border-white/20'
          : 'w-80 h-full border-l border-zinc-100'
      } bg-white flex flex-col pointer-events-auto shrink-0 relative z-30 overflow-hidden transition-all duration-300`}
    >
      {!agent ? (
        !isFloating && <ProjectView />
      ) : (
        <>
          <div
            className={`px-4 py-3 border-b border-zinc-100 bg-white ${isFloating ? 'bg-zinc-50/50' : ''}`}
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="shrink-0 rounded-2xl p-0.5 bg-zinc-50 border border-zinc-100/50">
                  <Avatar
                    type={isUser ? 'user' : isLead ? 'lead' : 'sub'}
                    color={agent.color}
                    size={48}
                  />
                </div>
                <div className="flex flex-col min-w-0">
                  <h2 className="text-xl font-black text-darkDelegation leading-tight truncate">
                    {agent.name}
                  </h2>
                  {!isUser && (
                    <div className="flex mt-1">
                      <div
                        className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter border shadow-sm leading-none flex items-center h-4 shrink-0"
                        style={{
                          backgroundColor: `${agent.color}15`,
                          color: agent.color,
                          borderColor: `${agent.color}30`
                        }}
                      >
                        {isLead ? 'Lead Agent' : 'Subagent'}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {tasksOnHold.length > 0 && (
                <div className="flex flex-col gap-3 p-4 bg-zinc-50 border border-zinc-100 rounded-xl shadow-sm">
                  <div className="flex items-center gap-1.5 font-black uppercase tracking-widest text-[9px] text-rose-500">
                    <div className="flex items-center justify-center w-5 h-5 border border-rose-200 bg-rose-50 rounded-lg">
                      <MessageSquareWarning size={12} strokeWidth={3} />
                    </div>
                    <span>Needs attention</span>
                  </div>
                  <p className="text-[12px] font-bold text-darkDelegation leading-tight">
                    {tasksOnHold[0].title}
                  </p>
                  {tasksOnHold[0].description && (
                    <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                      {tasksOnHold[0].description}
                    </p>
                  )}
                  <a
                    href="/"
                    className="flex items-center justify-center gap-2 bg-darkDelegation hover:bg-black active:scale-95 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                  >
                    <ExternalLink size={14} strokeWidth={3} />
                    Open operator console
                  </a>
                </div>
              )}
            </div>
          </div>

          <div
            className={`flex-1 overflow-y-auto relative min-h-0 ${isFloating ? 'bg-white' : 'bg-zinc-50/30'}`}
          >
            {isUser ? (
              <ProjectView />
            ) : (
              <AgentStatusPanel agentIndex={agent.index} />
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default InspectorPanel;
