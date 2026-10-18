import type * as THREE from 'three/webgpu';

// ── Store state (pure data + simple setters) ─────────────────
export type AgentState = 'idle' | 'moving' | 'working' | 'on_hold' | 'talking';

export interface CharacterState {
  instanceCount: number;
  selectedNpcIndex: number | null;
  selectedPosition: { x: number; y: number } | null;
  hoveredNpcIndex: number | null;
  hoveredPoiId: string | null;
  hoveredPoiLabel: string | null;
  hoverPosition: { x: number; y: number } | null;
  npcScreenPositions: Record<number, { x: number; y: number }>;

  // Real-time agent statuses for 3D synchronization
  agentStatuses: Record<number, AgentState>;
  setAgentStatus: (index: number, status: AgentState) => void;

  /** Set when the scene cannot load — most often the 3D assets are not fetched yet. */
  sceneError: string | null;
  setSceneError: (message: string | null) => void;

  setInstanceCount: (count: number) => void;
  setSelectedNpc: (index: number | null) => void;
  setSelectedPosition: (pos: { x: number; y: number } | null) => void;
  setHoveredNpc: (index: number | null, pos: { x: number; y: number } | null) => void;
  setHoveredPoi: (id: string | null, label: string | null, pos: { x: number; y: number } | null) => void;
}

export enum AnimationName {
  IDLE = 'Idle',
  WALK = 'Walk',
  TALK = 'Talk',
  LISTEN = 'Listen',
  SIT_DOWN = 'Sit',      // one-shot sit-down entry animation
  SIT_IDLE = 'Sit_Idle', // loop: seated idle
  SIT_WORK = 'Sit_Work', // loop: seated working
  LOOK_AROUND = 'LookAround',
  HAPPY = 'Happy',
  SAD = 'Sad',
  PICK = 'Pick',
  WAVE = 'Wave'
}

/** Stored as a float in the GPU agent buffer (.w component). */
export enum AgentBehavior {
  IDLE   = 0, // position locked, velocity zero, facing follows waypoint field (if non-zero)
  GOTO   = 1, // moves toward target waypoint (.x/.z of agent buffer)
  SEATED = 2, // position locked, velocity zero — character is seated, treated like IDLE on GPU
}

// ── Character State Machine ───────────────────────────────────

/**
 * High-level character state keys understood by the state machine.
 * Each maps declaratively to an animation + optional expression.
 */
export type CharacterStateKey =
  | 'idle'
  | 'walk'
  | 'talk'
  | 'listen'
  | 'sit_down'   // one-shot entry animation; auto-transitions to sit_idle
  | 'sit_idle'   // looping: seated at rest
  | 'sit_work'   // looping: seated working
  | 'look_around'
  | 'happy'
  | 'happy_loop' // looping version of happy, no auto-transition
  | 'sad'
  | 'pick'
  | 'wave'
  | 'wave_loop'; // looping version of wave, no auto-transition

/**
 * Declarative definition of a character state.
 * Adding a new state = adding one entry to STATE_MAP, no logic changes required.
 */
export interface CharacterStateDef {
  /** GPU animation to play. */
  animation: AnimationName;
  /** Facial expression to set when entering this state. Undefined = keep current. */
  expression?: ExpressionKey;
  /** True = animation loops forever. False = plays once then auto-transitions. */
  loop: boolean;
  /** Override the clip duration (seconds). Only used when loop=false. */
  durationOverride?: number;
  /** State to enter automatically after a non-looping animation finishes. */
  nextState?: CharacterStateKey;
  /**
   * Whether external callers can interrupt this state with a new one.
   * Non-interruptible states (e.g. 'sit_down' entry) must finish before new commands apply.
   */
  interruptible: boolean;
}

// ── POI System ────────────────────────────────────────────────

export interface PoiDef {
  id: string;
  /** World-space position to walk toward. */
  position: THREE.Vector3;
  /** World-space quaternion for orientation. */
  quaternion: THREE.Quaternion;
  /** State to enter upon arrival. */
  arrivalState: CharacterStateKey;
  /** Agent index currently occupying this POI, or null if free. */
  occupiedBy: number | null;
  /** Optional label to show on hover (e.g. "Sit down"). */
  label?: string;
}

// ── Driver interfaces ─────────────────────────────────────────

/**
 * Low-level rendering/GPU interface that behavior drivers call.
 * Decouples BehaviorManager and StateMachine from concrete CharacterManager.
 */
export interface ICharacterDriver {
  setPhysicsMode(index: number, mode: AgentBehavior): void;
  setAnimation(index: number, name: AnimationName, loop?: boolean): void;
  setExpression(index: number, key: ExpressionKey): void;
  setSpeaking(index: number, isSpeaking: boolean): void;
  getAgentState(index: number): AgentBehavior;
  getAnimationDuration(name: AnimationName): number;
  getCPUPositions(): Float32Array | null;
}

/**
 * High-level interface for per-agent behavior drivers
 * (PlayerInputDriver, NpcAgentDriver, etc.)
 */
export interface IAgentDriver {
  readonly agentIndex: number;
  update(positions: Float32Array, delta: number): void;
  dispose(): void;
}

// ── Misc ─────────────────────────────────────────────────────

export type ExpressionKey = 'idle' | 'listening' | 'neutral' | 'surprised' | 'happy' | 'sick' | 'wink' | 'doubtful' | 'sad';

export interface AtlasCoords {
  col: number;
  row: number;
}

export interface ExpressionConfig {
  eyes: AtlasCoords;
  mouth: AtlasCoords;
}
