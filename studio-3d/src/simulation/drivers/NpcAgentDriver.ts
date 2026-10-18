import * as THREE from 'three/webgpu';
import { AgentNode, USER_ID, MAX_AGENTS } from '../../data/agents';
import { useCoreStore } from '../../integration/store/coreStore';
import { IAgentDriver } from '../../types';
import { CharacterController } from '../CharacterController';


/**
 * NpcAgentDriver — drives a single NPC autonomously.
 *
 * Each NPC in the scene has its own instance of this class.
 * The update() method is the entry point for all NPC autonomous behavior.
 *
 * It respects the global Core phase and individual task status to determine behavior.
 */
export class NpcAgentDriver implements IAgentDriver {
  public readonly agentIndex: number;
  private behaviorTimer: number = Math.random() * 5 + 2; // Initial wait before moving
  private wasBusy: boolean = false;

  /**
   * External state injected by the pilar 'Integration' or 'Simulation' loop.
   * This removes the direct dependency on useUiStore (Interface).
   */
  private isChattingWithMe: boolean = false;

  constructor(
    agentIndex: number,
    protected readonly controller: CharacterController,
    protected readonly data: AgentNode,
  ) {
    this.agentIndex = agentIndex;
  }

  /** Sets whether the agent is currently engaged in a chat, suspending autonomy. */
  public setChatting(isChatting: boolean): void {
    this.isChattingWithMe = isChatting;
  }

  // ── IAgentDriver ─────────────────────────────────────────────

  public update(positions: Float32Array, delta: number): void {
    const currentState = this.controller.getState(this.agentIndex);
    const systemState = useCoreStore.getState();

    // If we are currently chatting with this NPC, suspend autonomous behavior
    if (this.isChattingWithMe) {
      return;
    }

    // Special behavior for Lead Agent when project is ready
    const isLeadCandidate = this.agentIndex === 1;
    if (isLeadCandidate && systemState.phase === 'done') {
      this._updateProjectReadyBehavior(positions, delta, currentState);
      return;
    }

    // Capture current active task (if any)
    const activeTask = systemState.tasks.find(
      t => t.assignedAgentId === this.agentIndex && (t.status === 'in_progress' || t.status === 'on_hold' || t.status === 'scheduled')
    );
    const isBusyWithSystem = !!activeTask;

    // Detect busy→idle transition: kick the agent to move away immediately
    if (this.wasBusy && !isBusyWithSystem) {
      this.behaviorTimer = 0;
    }
    this.wasBusy = isBusyWithSystem;

    // 1. SYSTEM HIERARCHY: If the agent is busy with a system task, the driver stays PASSIVE.
    // The SceneManager is responsible for the intentional movement to work/boardrooms.
    if (activeTask) {
      // Suspend ALL autonomous deciding while busy with the store-driven tasks.
      // We only allow flavor updates if we are not walking (set by SceneManager)
      if (currentState !== 'walk' && currentState !== 'sit_idle' && currentState !== 'sit_work') {
        // You could optionally put some idle-standing animations here, but basically
        // we want to stay where the SceneManager put us.
      }
      return;
    }

    // 2. AUTONOMOUS BEHAVIOR: Only decide new actions if we are currently resting in a stable state
    if (currentState === 'idle' || currentState === 'sit_idle' || currentState === 'look_around') {
      this.behaviorTimer -= delta;

      if (this.behaviorTimer <= 0) {
        this._decideNextAction(positions, currentState);
      }
    }
  }

  private _updateProjectReadyBehavior(positions: Float32Array, delta: number, currentState: string): void {
    const spawnId = `idle-spawn-${this.agentIndex}`;
    const targetPoi = this.controller.poiManager.getPoi(spawnId);
    if (!targetPoi) return;

    const currentPos = new THREE.Vector3(
      positions[this.agentIndex * 4],
      positions[this.agentIndex * 4 + 1],
      positions[this.agentIndex * 4 + 2]
    );

    // If not near spawn area, go there
    const dist = currentPos.distanceTo(targetPoi.position);
    if (dist > 1.5) { // Slightly larger threshold to avoid oscillation
      if (currentState !== 'walk') {
        this.controller.moveTo(this.agentIndex, targetPoi.position, 'happy_loop', undefined, currentPos, targetPoi.quaternion);
      }
      return;
    }

    // If arrived or idling near spawn, switch to the looping happy state.
    const isHappy = currentState === 'happy_loop';
    if (!isHappy && currentState !== 'walk') {
      // Snap to target orientation if we are already close but not in the final state
      this.controller.characterManager.setOrientation(this.agentIndex, targetPoi.quaternion);

      // Don't cancel movement if we're naturally arriving via moveTo's arrivalState
      if (currentState !== 'idle') {
        this.controller.cancelMovement(this.agentIndex);
      }
      this.controller.play(this.agentIndex, 'happy_loop');
    }
  }

  private _decideNextAction(positions: Float32Array, currentState: string): void {
    const rand = Math.random();
    const isSeated = currentState === 'sit_idle';

    // 1. Behavior when SEATED
    if (isSeated) {
      // 10% chance to just stay seated and play an expression
      if (rand < 0.1) {
        const expressions: ('sit_idle')[] = ['sit_idle'];
        const randomAnim = expressions[Math.floor(Math.random() * expressions.length)];
        this.controller.play(this.agentIndex, randomAnim);
        this.behaviorTimer = Math.random() * 15 + 15;
        return;
      }

      // 90% chance to stand up: fall through to movement logic below,
      // but only to move/wander, not to sit again immediately.
    }

    // Capture current position
    const currentPos = new THREE.Vector3(
      positions[this.agentIndex * 4],
      positions[this.agentIndex * 4 + 1],
      positions[this.agentIndex * 4 + 2]
    );

    // 2. Behavior when STANDING (or if decided to get up)

    // A. Chance to go sit (only if NOT already seated or if we explicitly want a new POI)
    // Lead agent candidates NEVER sit, they prefer to pace or stay standing
    const isLeadCandidate = this.agentIndex === 1;
    if (!isSeated && rand < 0.4 && !isLeadCandidate) {
      const pois = this.controller.poiManager.getFreePois('sit_idle', this.agentIndex);
      if (pois.length > 0) {
        const poi = pois[Math.floor(Math.random() * pois.length)];
        this.controller.walkToPoi(this.agentIndex, poi.id, undefined, currentPos);
        this.behaviorTimer = Math.random() * 15 + 15;
        return;
      }
    }

    // B. Chance to wander to common areas (both standing and those getting up)
    if (rand < 0.7) {
      const areaPois = this.controller.poiManager.getFreePoisByPrefix('area-', this.agentIndex);
      if (areaPois.length > 0) {
        const areaPoi = areaPois[Math.floor(Math.random() * areaPois.length)];

        // Calculate distributed position (0.75m radius, 1 slot per MAX_AGENTS)
        const angle = (this.agentIndex * (Math.PI * 2)) / MAX_AGENTS;
        const radius = 1;
        const target = areaPoi.position.clone();
        target.x += Math.cos(angle) * radius;
        target.z += Math.sin(angle) * radius;

        // Calculate "natural" rotation: facing the center of the area
        const direction = new THREE.Vector3().subVectors(areaPoi.position, target).normalize();
        const rotationY = Math.atan2(direction.x, direction.z);
        const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);

        if (this.controller.moveTo(this.agentIndex, target, 'look_around', undefined, currentPos, targetQuaternion)) {
          this.controller.poiManager.releaseAll(this.agentIndex);
          this.behaviorTimer = Math.random() * 5 + 10;
          return;
        }
      }
    }

    // C. Fallback: play a short reaction animation (only if standing)
    if (!isSeated) {
      const expressions: ('look_around' | 'wave' | 'happy')[] = ['look_around', 'wave', 'happy'];
      const randomAnim = expressions[Math.floor(Math.random() * expressions.length)];
      this.controller.play(this.agentIndex, randomAnim);
      this.behaviorTimer = Math.random() * 5 + 5;
    } else {
      // If we were seated and decided to get up (10%) but found no place to go, stay seated.
      this.behaviorTimer = 5;
    }
  }

  public dispose(): void { }
}
