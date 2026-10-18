import { USER_COLOR } from '../theme/brand';

export const USER_ID = 'user';
export const USER_NAME = 'You';

/**
 * The office holds the operator plus every AgentTube agent.
 * Upstream capped this at 5 for its editable teams; AgentTube has 8 roles.
 * `CharacterManager` sizes its GPU buffers from the agent count, so this is the
 * only limit that needed raising.
 */
export const MAX_AGENTS = 8;

export { USER_COLOR };
export const DEFAULT_AGENTIC_SET_ID = 'agenttube';

/** Stage keys from GENERATION_STAGES in ../../utils/generation-recovery-service.js. */
export type GenerationStage =
  | 'strategy'
  | 'script'
  | 'thumbnail'
  | 'seo'
  | 'production'
  | 'quality_review';

export interface AgentNode {
  id: string;
  index: number;
  name: string;
  description: string;
  color: string;
  model: string;
  humanInTheLoop?: boolean;
  /** Generation stage this character represents, when it maps to one. */
  stage?: GenerationStage;
  position?: { x: number; y: number };
  subagents?: AgentNode[];
}

export type OutputType = 'text' | 'image' | 'music' | 'video';

export interface AgenticSystem {
  id: string;
  teamName: string;
  teamType: string;
  teamDescription: string;
  color: string;
  outputType: OutputType;
  outputModel: string;
  outputAutoApprove?: boolean;
  user: {
    index: number;
    model: string;
    position?: { x: number; y: number };
  };
  leadAgent: AgentNode;
}

/**
 * One team, not editable: it mirrors the agents AgentTube actually registers in
 * index.js (`this.agents = { strategy, scriptWriter, ... }`), so the office is a
 * picture of the real pipeline rather than a design surface.
 */
export const AGENTIC_SETS: AgenticSystem[] = [
  {
    id: 'agenttube',
    teamName: 'AgentTube',
    teamType: 'Channel',
    teamDescription:
      'The agents that research, write, produce, review and publish this channel.',
    color: '#ff4d5e',
    outputType: 'video',
    outputModel: 'FFmpeg',
    outputAutoApprove: false,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'channel-lead',
      index: 1,
      name: 'Channel Lead',
      description:
        'Runs the Autonomous Channel Operator: refreshes signals, plans the editorial calendar, then runs the final quality review.',
      color: '#ff4d5e',
      model: 'quality review',
      stage: 'quality_review',
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: 'content-strategy',
          index: 2,
          name: 'Strategist',
          description: 'Analyzes YouTube trends, picks the topic and angle, plans the content calendar.',
          color: '#4285F4',
          model: 'stage: strategy',
          stage: 'strategy',
          position: { x: -600, y: 280 }
        },
        {
          id: 'script-writer',
          index: 3,
          name: 'Scriptwriter',
          description: 'Writes the hook, narrative and CTA, and lists the factual claims that need review.',
          color: '#34A853',
          model: 'stage: script',
          stage: 'script',
          position: { x: -400, y: 280 }
        },
        {
          id: 'thumbnail-designer',
          index: 4,
          name: 'Thumbnail Designer',
          description: 'Designs the thumbnail and prepares packaging variants.',
          color: '#FBBC05',
          model: 'stage: thumbnail',
          stage: 'thumbnail',
          position: { x: -200, y: 280 }
        },
        {
          id: 'seo-optimizer',
          index: 5,
          name: 'SEO Optimizer',
          description: 'Writes the title, description, tags and keywords for discoverability.',
          color: '#A142F4',
          model: 'stage: seo',
          stage: 'seo',
          position: { x: 0, y: 280 }
        },
        {
          id: 'production',
          index: 6,
          name: 'Producer',
          description: 'Generates narration and visuals, then assembles the real MP4 with FFmpeg.',
          color: '#FF6D01',
          model: 'stage: production',
          stage: 'production',
          position: { x: 200, y: 280 }
        },
        {
          id: 'publishing',
          index: 7,
          name: 'Publisher',
          description: 'Schedules and uploads approved videos, and manages the publishing queue.',
          color: '#00ACC1',
          model: 'publishing queue',
          position: { x: 400, y: 280 }
        },
        {
          id: 'analytics',
          index: 8,
          name: 'Analyst',
          description: 'Captures 24-hour and 7-day performance evidence and proposes learnings.',
          color: '#9E9E9E',
          model: 'analytics windows',
          position: { x: 600, y: 280 }
        }
      ]
    }
  }
];

export function getAgentSet(id: string, customSystems: AgenticSystem[] = []): AgenticSystem {
  return (
    customSystems.find((s) => s.id === id) ||
    AGENTIC_SETS.find((s) => s.id === id) ||
    AGENTIC_SETS[0]
  );
}

export function getAllAgents(system: AgenticSystem): AgentNode[] {
  const agents: AgentNode[] = [];
  const traverse = (node: AgentNode) => {
    agents.push(node);
    if (node.subagents) {
      node.subagents.forEach(traverse);
    }
  };
  traverse(system.leadAgent);
  return agents;
}

export function getAllCharacters(system: AgenticSystem): AgentNode[] {
  const userNode: AgentNode = {
    id: USER_ID,
    index: system.user.index,
    name: USER_NAME,
    color: USER_COLOR,
    model: system.user.model,
    description: 'You. Nothing is scheduled or published without your approval.'
  };
  return [userNode, ...getAllAgents(system)];
}

/** Character index per generation stage, derived from the team above. */
export const STAGE_AGENT_INDEX: Record<GenerationStage, number> = Object.fromEntries(
  getAllAgents(AGENTIC_SETS[0])
    .filter((agent) => agent.stage)
    .map((agent) => [agent.stage, agent.index])
) as Record<GenerationStage, number>;

export const OPERATOR_INDEX = 0;
export const LEAD_INDEX = 1;
export const PUBLISHER_INDEX = 7;
export const ANALYST_INDEX = 8;
