import { ChevronDown, ChevronRight } from 'lucide-react'
import React, { useState } from 'react'
import { getAllAgents, USER_NAME } from '../data/agents'
import { USER_COLOR, USER_COLOR_LIGHT, USER_COLOR_SOFT } from '../theme/brand'
import { useCoreStore, type Task, type TaskStatus } from '../integration/store/coreStore'
import { getActiveAgentSet } from '../integration/store/teamStore'
import { useUiStore } from '../integration/store/uiStore'

// 'scheduled' is never produced by the bridge: a stage that has not started yet gets no
// task, so its character keeps wandering instead of freezing at a desk.
const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'on_hold', label: 'Needs attention' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'done', label: 'Done' },
]

interface KanbanPanelProps {
  height?: number;
}

function renderAgentTag(agentIndex: number) {
  const system = getActiveAgentSet();
  if (agentIndex === 0) { // Client / You
    return (
      <span key={agentIndex} className="flex items-center gap-1 text-[10px] font-bold" style={{ color: USER_COLOR }}>
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: USER_COLOR }}
        />
        {USER_NAME}
      </span>
    )
  }
  const agent = getAllAgents(system).find(a => a.index === agentIndex)
  if (!agent) return null
  return (
    <span key={agentIndex} className="flex items-center gap-1 text-[10px] text-zinc-500">
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: agent.color }}
      />
      {agent.name}
    </span>
  )
}

function TaskCard({ task }: { task: Task }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { setSelectedNpc } = useUiStore()

  const effectiveAgentIds = [task.assignedAgentId];

  const handleSelectAgent = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNpc(task.assignedAgentId);
  };

  return (
    <div className="bg-white rounded-lg border border-black/5 shadow-sm p-3 space-y-2 group relative">
      <div
        className="flex items-start justify-between gap-1 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-xs text-darkDelegation leading-snug font-bold flex-1">
          {task.title || 'Untitled Task'}
        </h3>
        <button className="text-zinc-300 group-hover:text-zinc-500 transition-colors">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {isExpanded && (
        <p className="text-[11px] text-zinc-500 leading-relaxed bg-zinc-50/50 p-2 rounded border border-black/5 animate-in fade-in slide-in-from-top-1 duration-200">
          {task.description}
        </p>
      )}

      <div className="flex items-center justify-between gap-x-2 gap-y-1 pt-1">
        <button
          onClick={handleSelectAgent}
          className="flex flex-wrap gap-x-2 gap-y-1"
          title="Show this agent in the office"
        >
          {effectiveAgentIds.map(renderAgentTag)}
        </button>

        {task.status === 'in_progress' && (
          <span
            className="inline-block text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5 shadow-sm border whitespace-nowrap"
            style={{
              color: USER_COLOR,
              backgroundColor: USER_COLOR_LIGHT,
              borderColor: USER_COLOR_SOFT
            }}
          >
            working
          </span>
        )}
      </div>
    </div>
  )
}

export function KanbanPanel({ height = 320 }: KanbanPanelProps) {
  const { tasks } = useCoreStore()

  return (
    <div
      className="w-full bg-white border-t border-black/8 flex flex-col pointer-events-auto shrink-0 relative"
      style={{ height }}
    >
      {/* Columns Scroll Area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-zinc-50/20">
        <div className="flex h-full min-w-max px-5 py-4 gap-4">
          {COLUMNS.map(({ status, label }) => {
            const colTasks = tasks.filter((t) => t.status === status)
            return (
              <div key={status} className="w-52 flex flex-col gap-3">
                <div className="flex items-center justify-between shrink-0 select-none">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 leading-none">
                      {label}
                    </span>
                    <span className="px-1.5 py-0.5 bg-zinc-100 text-zinc-400 text-[9px] font-bold rounded-md min-w-4.5 text-center">
                      {colTasks.length}
                    </span>
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1">
                  {colTasks.map((t) => (
                    <TaskCard key={t.id} task={t} />
                  ))}
                  {colTasks.length === 0 && (
                    <div className="border border-dashed border-zinc-100 rounded-lg p-4 flex items-center justify-center select-none">
                      <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Empty</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
