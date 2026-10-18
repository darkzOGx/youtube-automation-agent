import * as THREE from 'three/webgpu';

import { PoiDef } from '../../types';
import { CHARACTER_Y_OFFSET, PICK_RADIUS, POI_PICK_RADIUS } from '../constants';

const DRAG_THRESHOLD_PX = 4;
const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0

export class InputManager {
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private dragStartX = 0;
  private dragStartY = 0;
  private isDragging = false;

  public selectedIndex: number | null = null;

  constructor(
    private canvas: HTMLElement,
    private camera: THREE.PerspectiveCamera,
    private getPositions: () => Float32Array | null,
    private getCount: () => number,
    private onSelect: (index: number | null) => void,
    private onWaypoint: (x: number, z: number) => void,
    private onHover: (index: number | null, pos: { x: number; y: number } | null) => void,
    private getPois: () => PoiDef[],
    private onPoiHover: (id: string | null, label: string | null, pos: { x: number; y: number } | null) => void,
    private onPoiClick: (id: string) => void,
    private raycastObject?: THREE.Object3D,
    private isPointValid?: (point: THREE.Vector3) => boolean,
  ) {

    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    canvas.addEventListener('pointerdown', this.boundPointerDown);
    canvas.addEventListener('pointermove', this.boundPointerMove);
    canvas.addEventListener('pointerup', this.boundPointerUp);
  }

  private handlePointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.isDragging = false;
  }

  private handlePointerMove(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // If any button is pressed, skip hover/cursor updates to avoid fighting with OrbitControls or dragging logic
    if (event.buttons !== 0) {
      if (event.buttons === 1) {
        const dx = event.clientX - this.dragStartX;
        const dy = event.clientY - this.dragStartY;
        if ((dx * dx + dy * dy) > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          this.isDragging = true;
        }
      }
      return;
    }

    // Reset dragging state when no buttons are pressed
    this.isDragging = false;

    // Detect hover
    const hoveredIdx = this.getAgentAtPointer();

    // If an NPC is selected, only allow hovering that specific NPC
    const effectiveHoverIdx = (this.selectedIndex !== null && hoveredIdx !== this.selectedIndex)
      ? null
      : hoveredIdx;

    if (effectiveHoverIdx !== null) {
      this.canvas.style.cursor = 'pointer';

      // Project 3D position to 2D for the bubble
      const positions = this.getPositions();
      if (positions) {
        const worldPos = new THREE.Vector3(
          positions[effectiveHoverIdx * 4],
          positions[effectiveHoverIdx * 4 + 1] + CHARACTER_Y_OFFSET + 0.4,
          positions[effectiveHoverIdx * 4 + 2]
        );
        worldPos.project(this.camera);
        const x = (worldPos.x * 0.5 + 0.5) * rect.width;
        const y = (worldPos.y * -0.5 + 0.5) * rect.height;
        this.onPoiHover(null, null, null);
        this.onHover(effectiveHoverIdx, { x, y });
      }
    } else {
      // Not over an agent, check POIs
      const hoveredPoi = this.getPoiAtPointer();

      if (hoveredPoi && hoveredPoi.occupiedBy === null && hoveredPoi.label) {
        this.canvas.style.cursor = 'pointer';

        const worldPos = hoveredPoi.position.clone();
        worldPos.y += 0.5; // Bubble a bit above the POI
        worldPos.project(this.camera);
        const x = (worldPos.x * 0.5 + 0.5) * rect.width;
        const y = (worldPos.y * -0.5 + 0.5) * rect.height;

        this.onHover(null, null);
        this.onPoiHover(hoveredPoi.id, hoveredPoi.label, { x, y });
      } else {
        // Not over agent or POI, check floor/navmesh
        const target = this.getWorldClickPosition();
        this.canvas.style.cursor = target ? 'pointer' : 'auto';
        this.onHover(null, null);
        this.onPoiHover(null, null, null);
      }
    }
  }

  private getAgentAtPointer(): number | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const positions = this.getPositions();
    const count = this.getCount();
    if (!positions || count === 0) return null;

    const ray = this.raycaster.ray;
    let closestT = Infinity;
    let closestIdx: number | null = null;

    for (let i = 0; i < count; i++) {
      const cx = positions[i * 4];
      const cy = positions[i * 4 + 1] + CHARACTER_Y_OFFSET;
      const cz = positions[i * 4 + 2];

      const ocx = ray.origin.x - cx;
      const ocy = ray.origin.y - cy;
      const ocz = ray.origin.z - cz;

      const halfB = ocx * ray.direction.x + ocy * ray.direction.y + ocz * ray.direction.z;
      const c = ocx * ocx + ocy * ocy + ocz * ocz - PICK_RADIUS * PICK_RADIUS;
      const discriminant = halfB * halfB - c;

      if (discriminant < 0) continue;

      const t = -halfB - Math.sqrt(discriminant);
      if (t > 0 && t < closestT) {
        closestT = t;
        closestIdx = i;
      }
    }
    return closestIdx;
  }

  private getPoiAtPointer(): PoiDef | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const pois = this.getPois();

    let closestT = Infinity;
    let closestPoi: PoiDef | null = null;

    for (const poi of pois) {
      if (!poi.label) continue;

      // Project POI to a small sphere for easier clicking than just the point
      const ocx = this.raycaster.ray.origin.x - poi.position.x;
      const ocy = this.raycaster.ray.origin.y - poi.position.y;
      const ocz = this.raycaster.ray.origin.z - poi.position.z;

      const halfB = ocx * this.raycaster.ray.direction.x + ocy * this.raycaster.ray.direction.y + ocz * this.raycaster.ray.direction.z;
      const c = ocx * ocx + ocy * ocy + ocz * ocz - POI_PICK_RADIUS * POI_PICK_RADIUS;
      const discriminant = halfB * halfB - c;

      if (discriminant < 0) continue;

      const t = -halfB - Math.sqrt(discriminant);
      if (t > 0 && t < closestT) {
        closestT = t;
        closestPoi = poi;
      }
    }

    return closestPoi;
  }

  private handlePointerUp(event: PointerEvent) {
    if (event.button !== 0) return;
    if (this.isDragging) return;
    this.handleClick(event as unknown as MouseEvent);
  }

  private handleClick(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const closestIdx = this.getAgentAtPointer();

    if (closestIdx !== null) {
      if (closestIdx === this.selectedIndex) {
        // Click on already-selected character → deselect
        this.selectedIndex = null;
        this.onSelect(null);
      } else {
        // Click on a new character (NPC or Player) → select it
        this.selectedIndex = closestIdx;
        this.onSelect(closestIdx);
      }
    } else {
      // Click missed all characters, check POIs
      const hoveredPoi = this.getPoiAtPointer();

      if (hoveredPoi && hoveredPoi.occupiedBy === null && hoveredPoi.label) {
        // Clear hover state immediately on click
        this.onPoiHover(null, null, null);
        this.onPoiClick(hoveredPoi.id);
      } else if (this.selectedIndex !== null) {
        // If something was selected, deselect it first
        this.selectedIndex = null;
        this.onSelect(null);
      } else {
        // If nothing was selected, move the player
        const target = this.getWorldClickPosition();
        if (target) {
          this.onWaypoint(target.x, target.z);
        }
      }
    }
  }

  private getWorldClickPosition(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);

    let point: THREE.Vector3 | null = null;

    if (this.raycastObject) {
      const intersects = this.raycaster.intersectObject(this.raycastObject, true);
      if (intersects.length > 0) {
        // Find first mesh that is a navmesh
        const navMeshMatch = intersects.find(hit => hit.object.name.toLowerCase().includes('navmesh'));
        if (navMeshMatch) {
          point = navMeshMatch.point;
        } else {
          // Fallback: if no navmesh hit, don't allow movement on other meshes (like walls/props)
          return null;
        }
      }
    } else {
      // Fallback to infinite plane (only if no raycastObject)
      const target = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(FLOOR_PLANE, target)) {
        point = target;
      }
    }

    if (point && this.isPointValid) {
      return this.isPointValid(point) ? point : null;
    }

    return point;
  }

  public dispose() {
    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    this.canvas.removeEventListener('pointermove', this.boundPointerMove);
    this.canvas.removeEventListener('pointerup', this.boundPointerUp);
  }
}
