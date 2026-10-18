import { create } from 'zustand';
import { AgenticSystem, DEFAULT_AGENTIC_SET_ID, getAgentSet } from '../../data/agents';

export type AgentSet = AgenticSystem;

/**
 * The team is fixed: it mirrors AgentTube's real agents, so there is nothing to select,
 * create or persist. Upstream's editable-team state collapses to this single id, kept as
 * a store only so the panels can keep reading it the way they always did.
 */
interface TeamState {
  selectedAgentSetId: string;
}

export const useTeamStore = create<TeamState>()(() => ({
  selectedAgentSetId: DEFAULT_AGENTIC_SET_ID
}));

/** Returns the active AgentSet. Safe to call from service/non-React contexts. */
export function getActiveAgentSet(): AgentSet {
  return getAgentSet(useTeamStore.getState().selectedAgentSetId);
}

/** React hook for accessing the active team. */
export function useActiveTeam(): AgentSet {
  return getAgentSet(useTeamStore((state) => state.selectedAgentSetId));
}
