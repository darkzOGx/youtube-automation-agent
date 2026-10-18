import * as THREE from 'three/webgpu';
import { IAgentDriver } from '../../types';
import { CharacterController } from '../CharacterController';

/**
 * PlayerInputDriver — translates user input into CharacterController actions.
 *
 * This is the only driver that listens to human input. It does NOT contain
 * any animation or expression logic; it just calls controller.moveTo(),
 * controller.play(), etc. in response to user gestures.
 *
 * Wired up by SceneManager after InputManager is created.
 */
export class PlayerInputDriver implements IAgentDriver {
  public readonly agentIndex: number;
  private lastPositions: Float32Array | null = null;

  constructor(agentIndex: number, private readonly controller: CharacterController) {
    this.agentIndex = agentIndex;
  }

  // ── Input handlers (called by InputManager callbacks) ────────

  /** User clicked on the floor: walk the player to that position. */
  public onFloorClick(x: number, z: number): void {
    const target = new THREE.Vector3(x, 0, z);
    const from = this._getCurrentPos();
    this.controller.moveTo(this.agentIndex, target, 'idle', undefined, from);
  }

  /** User clicked on a POI (e.g. chair): walk to and interact. */
  public onPoiClick(id: string): void {
    const from = this._getCurrentPos();
    this.controller.walkToPoi(this.agentIndex, id, undefined, from);

  }

  /**
   * Walk the player toward a specific world position with a custom arrival state.
   * Used by SceneManager when the player initiates a chat with an NPC.
   */
  public walkTo(
    target: THREE.Vector3,
    arrivalState: import('../../types').CharacterStateKey = 'idle',
    onArrival?: (index: number) => void,
  ): void {
    const from = this._getCurrentPos();
    this.controller.moveTo(this.agentIndex, target, arrivalState, onArrival, from);

  }

  private _getCurrentPos(): THREE.Vector3 | undefined {
    if (!this.lastPositions) return undefined;
    return new THREE.Vector3(
      this.lastPositions[this.agentIndex * 4],
      this.lastPositions[this.agentIndex * 4 + 1],
      this.lastPositions[this.agentIndex * 4 + 2]
    );
  }

  /** Cancel current movement (e.g. chat was aborted before arrival). */
  public cancelMovement(): void {
    this.controller.cancelMovement(this.agentIndex);

  }

  // ── IAgentDriver ─────────────────────────────────────────────

  public update(positions: Float32Array, _delta: number): void {
    this.lastPositions = positions;
  }

  public dispose(): void {}
}
