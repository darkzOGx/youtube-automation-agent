import { create } from 'zustand';
import { getAllAgents } from '../../data/agents';
import { AgentState, CharacterState } from '../../types';
import { getActiveAgentSet } from './teamStore';

/**
 * Pure view state for the 3D scene: selection, hover, per-agent status.
 * Upstream also held the BYOK key, the chat transcript and the audit modal; none of
 * those exist here — AgentTube keeps provider credentials on the server.
 */
export const useUiStore = create<CharacterState>()((set) => ({
  instanceCount: getAllAgents(getActiveAgentSet()).length + 1, // +1 for the operator

  selectedNpcIndex: null,
  selectedPosition: null,
  hoveredNpcIndex: null,
  hoveredPoiId: null,
  hoveredPoiLabel: null,
  hoverPosition: null,
  npcScreenPositions: {},

  agentStatuses: {},
  setAgentStatus: (index: number, status: AgentState) =>
    set((s) => ({
      agentStatuses: { ...s.agentStatuses, [index]: status }
    })),

  sceneError: null,
  setSceneError: (message: string | null) => set({ sceneError: message }),

  setInstanceCount: (count: number) => set({ instanceCount: count }),

  setSelectedNpc: (index: number | null) =>
    set({
      selectedNpcIndex: index,
      selectedPosition: null
    }),
  setSelectedPosition: (pos: { x: number; y: number } | null) => set({ selectedPosition: pos }),
  setHoveredNpc: (index: number | null, pos: { x: number; y: number } | null) =>
    set({
      hoveredNpcIndex: index,
      hoverPosition: pos,
      hoveredPoiId: null,
      hoveredPoiLabel: null
    }),
  setHoveredPoi: (
    id: string | null,
    label: string | null,
    pos: { x: number; y: number } | null
  ) =>
    set({
      hoveredPoiId: id,
      hoveredPoiLabel: label,
      hoverPosition: pos,
      hoveredNpcIndex: null
    })
}));
