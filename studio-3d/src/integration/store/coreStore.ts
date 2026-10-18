import { create } from 'zustand';

/**
 * The state the 3D simulation reads.
 *
 * Upstream this was written by an in-browser LLM (AgentBrain) and also carried token
 * usage, cost estimates, chat histories and raw request/response traces. Here it is
 * written only by src/bridge/useAgentTubeFeed, from AgentTube's real job state — so
 * everything LLM-specific is gone and `tasks`, `phase` and `actionLog` are read-only
 * as far as the UI is concerned.
 *
 * src/simulation/ depends on exactly three things in here: `tasks`, `phase` and
 * `isResizing`.
 */

export type TaskStatus = 'scheduled' | 'on_hold' | 'in_progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedAgentId: number;
  status: TaskStatus;
  requiresUserApproval: boolean;
  output?: string;
  revisions: never[];
  createdAt: number;
  updatedAt: number;
}

export interface ActionLogEntry {
  id: string;
  timestamp: number;
  agentIndex: number;
  action: string;
  taskId?: string;
}

export type ProjectPhase = 'idle' | 'working' | 'done';

interface CoreState {
  /** Projected from AgentTube's generation checkpoints and publishing pipeline. */
  tasks: Task[];
  phase: ProjectPhase;
  actionLog: ActionLogEntry[];

  isKanbanOpen: boolean;
  isLogOpen: boolean;
  logFilterAgentIndex: number | null;
  isResizing: boolean;

  setKanbanOpen: (open: boolean) => void;
  setLogOpen: (open: boolean, filterAgent?: number | null) => void;
  setIsResizing: (isResizing: boolean) => void;
}

export const useCoreStore = create<CoreState>()((set) => ({
  tasks: [],
  phase: 'idle',
  actionLog: [],

  isKanbanOpen: true,
  isLogOpen: true,
  logFilterAgentIndex: null,
  isResizing: false,

  setKanbanOpen: (open) => set({ isKanbanOpen: open }),
  setLogOpen: (open, filterAgent = null) =>
    set({ isLogOpen: open, logFilterAgentIndex: filterAgent ?? null }),
  setIsResizing: (isResizing) => set({ isResizing })
}));
