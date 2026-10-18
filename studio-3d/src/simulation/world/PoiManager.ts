import * as THREE from 'three/webgpu';
import { CharacterStateKey, PoiDef } from '../../types';

/**
 * Manages Points of Interest (POIs) in the world.
 *
 * A POI is a named location that, when reached by an agent, triggers
 * a specific character state (e.g. 'sit_idle', 'sit_work').
 *
 * Procedural POIs are added via addPoi().
 * In the future, loadFromGlb() will extract them from empty objects
 * in a scene GLB (naming convention: pois named "poi-<state>-<id>").
 */
export class PoiManager {
  private pois = new Map<string, PoiDef>();

  // ── Registration ─────────────────────────────────────────────

  public addPoi(def: PoiDef): void {
    this.pois.set(def.id, { ...def });
  }

  public removePoi(id: string): void {
    this.pois.delete(id);
  }

  // ── Occupancy ────────────────────────────────────────────────

  /** Mark a POI as occupied by an agent. */
  public occupy(id: string, agentIndex: number): void {
    const poi = this.pois.get(id);
    if (poi) poi.occupiedBy = agentIndex;
  }

  /** Release the POI so other agents can use it. */
  public release(id: string): void {
    const poi = this.pois.get(id);
    if (poi) poi.occupiedBy = null;
  }

  /** Release all POIs held by a specific agent. */
  public releaseAll(agentIndex: number): void {
    for (const poi of this.pois.values()) {
      if (poi.occupiedBy === agentIndex) poi.occupiedBy = null;
    }
  }

  // ── Queries ──────────────────────────────────────────────────

  public getPoi(id: string): PoiDef | undefined {
    return this.pois.get(id);
  }

  /** Returns all free POIs for a specific arrival state.
   * If agentIndex is provided, include the POIs already occupied by that agent.
   */
  public getFreePois(arrivalState: CharacterStateKey, agentIndex?: number): PoiDef[] {
    return Array.from(this.pois.values()).filter(
      p => p.arrivalState === arrivalState && (p.occupiedBy === null || p.occupiedBy === agentIndex)
    );
  }

  /** Returns all free POIs that start with a specific ID prefix (e.g. 'spawn', 'area'). */
  public getFreePoisByPrefix(prefix: string, agentIndex?: number): PoiDef[] {
    return Array.from(this.pois.values()).filter(
      p => p.id.includes(prefix) && (p.occupiedBy === null || p.occupiedBy === agentIndex)
    );
  }

  /** Returns a random free POI matching the given prefix. */
  public getRandomFreePoi(prefix?: string): PoiDef | null {
    const candidates = prefix
      ? this.getFreePoisByPrefix(prefix)
      : Array.from(this.pois.values()).filter(p => p.occupiedBy === null);

    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /** Returns the nearest free POI of a given arrival state to a world position, or null. */
  public getNearestFreePoi(
    arrivalState: CharacterStateKey,
    from: THREE.Vector3,
  ): PoiDef | null {
    const candidates = this.getFreePois(arrivalState);
    if (candidates.length === 0) return null;

    let nearest: PoiDef | null = null;
    let nearestDist2 = Infinity;

    for (const poi of candidates) {
      const dx = poi.position.x - from.x;
      const dz = poi.position.z - from.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearestDist2) {
        nearestDist2 = d2;
        nearest = poi;
      }
    }
    return nearest;
  }

  // ── Future: GLB loading ─────────────────────────────────────

  /**
   * Extract POIs from a loaded GLB scene.
   * Convention: empty objects named "poi-<arrivalState>-<uniqueId>".
   * Special arrival states: "spawn" and "area" default to "idle" state.
   *
   * Example: "poi-sit_idle-chair_01", "poi-sit_work-desk_02", "poi-spawn-A", "poi-area-lounge"
   */
  public loadFromGlb(scene: THREE.Object3D): void {
    scene.traverse((child) => {
      // Regex detects poi-TYPE-ID
      const match = child.name.match(/^poi-([a-z0-9_]+)-(.+)$/);
      if (!match) return;

      const type = match[1];
      const uniqueId = match[2];

      // "spawn" and "area" aren't real character states, they map to 'idle'.
      // Anything else is treated as a CharacterStateKey ('sit_idle', etc).
      let arrivalState: CharacterStateKey = 'idle';
      let label: string | undefined = undefined;

      if (type !== 'spawn' && type !== 'area') {
        arrivalState = type as CharacterStateKey;
        if (arrivalState === 'sit_idle') {
          label = 'Sit down';
        }
      }

      const id = `${type}-${uniqueId}`;

      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      child.getWorldPosition(worldPos);
      child.getWorldQuaternion(worldQuat);

      this.addPoi({ id, position: worldPos, quaternion: worldQuat, arrivalState, occupiedBy: null, label });
    });
  }

  public getAllPois(): PoiDef[] {
    return Array.from(this.pois.values());
  }

  /** Returns ALL POIs whose ID contains the given prefix, regardless of occupancy.
   * Results are sorted by ID for a consistent, repeatable order.
   */
  public getPoisByPrefix(prefix: string): PoiDef[] {
    return Array.from(this.pois.values())
      .filter(p => p.id.includes(prefix))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}
