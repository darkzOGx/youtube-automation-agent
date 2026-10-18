import * as THREE from 'three/webgpu';
import { getAllAgents } from '../data/agents';
import { CharacterController } from './CharacterController';
import { Engine } from './core/Engine';
import { Stage } from './core/Stage';
import { DriverManager } from './drivers/DriverManager';
import { CharacterManager } from './entities/CharacterManager';
import { InputManager } from './input/InputManager';
import { NavMeshManager } from './pathfinding/NavMeshManager';
import { PoiManager } from './world/PoiManager';
import { WorldManager } from './world/WorldManager';

import { useCoreStore } from '../integration/store/coreStore';
import { getActiveAgentSet } from '../integration/store/teamStore';
import { useUiStore } from '../integration/store/uiStore';
import { AgentBehavior } from '../types';
import { BUBBLE_Y_OFFSET } from './constants';

/**
 * SceneManager — Visual Integration Layer.
 * 
 * DESIGN PRINCIPLE: Visual Reflex of Logic.
 * 1. Subscribes to the Store to Decouple logic from 3D.
 * 2. Visual actions are fire-and-forget.
 * 3. Smart POI assignment ensures NPCs find desks even with diverse GLB names.
 */
export class SceneManager {
  private engine: Engine;
  private stage: Stage;
  private characterManager: CharacterManager;
  private controller: CharacterController | null = null;
  private navMesh: NavMeshManager;
  private poiManager: PoiManager;
  private worldManager: WorldManager;
  private driverManager: DriverManager | null = null;

  private selectedIndex: number | null = null;

  private unsubs: (() => void)[] = [];
  private isDisposed = false;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement) {
    this.container = container;
    this.engine = new Engine(container);
    this.stage = new Stage(this.engine.renderer.domElement);
    this.characterManager = new CharacterManager(this.stage.scene);
    this.navMesh = new NavMeshManager();
    this.poiManager = new PoiManager();
    this.characterManager.setPoiManager(this.poiManager);
    this.worldManager = new WorldManager(this.stage.scene, this.navMesh, this.poiManager);

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    this.init();
    this.startWatchingCoreStore();
  }

  private startWatchingCoreStore() {
    this.unsubs.push(
      useCoreStore.subscribe((state, prevState) => {
        const agentIndices = Array.from(new Set(state.tasks.flatMap(t => [t.assignedAgentId].filter(id => id !== undefined && id !== 0))));

        agentIndices.forEach(id => {
          const myTasks = state.tasks.filter(t => t.assignedAgentId === id);
          const hasChange = myTasks.some(t => {
            const pt = prevState.tasks.find(old => old.id === t.id);
            return !pt || pt.status !== t.status;
          });
          
          if (!hasChange) return;

          const onHold = myTasks.find(t => t.status === 'on_hold');
          const inProgress = myTasks.find(t => t.status === 'in_progress');
          const justDone = myTasks.some(t => t.status === 'done' && !prevState.tasks.find(pt => pt.id === t.id && pt.status === 'done'));

          if (onHold) {
            this.moveNpcToBoardroom(id);
          } else if (inProgress) {
            this.setNpcWorking(id, true);
          } else if (justDone) {
            this.setNpcWorking(id, false);
            this.moveNpcToSpawn(id);
          }
        });
      })
    );
  }

  private async init() {
    await this.engine.init();
    if (this.isDisposed) return;

    // The office and character models are not shipped with this repository
    // (CC BY-NC 4.0 — see ../../LICENSE), so a missing asset is an expected state.
    try {
      await this.worldManager.load();
      await this.characterManager.load();
    } catch (error) {
      if (this.isDisposed) return;
      useUiStore.getState().setSceneError(
        error instanceof Error ? error.message : String(error)
      );
      return;
    }
    if (this.isDisposed) return;

    const state = useUiStore.getState();
    this.characterManager.setInstanceCount(state.instanceCount);
    this.controller = new CharacterController(this.characterManager, this.navMesh, this.poiManager);
    this.driverManager = new DriverManager(this.controller);
    
    const activeSet = getActiveAgentSet();
    const playerIndex = activeSet.user.index;
    this.driverManager.registerPlayer(playerIndex);

    getAllAgents(activeSet).forEach((agent) => {
      if (agent.index !== playerIndex) this.driverManager!.registerNpc(agent.index, agent);
    });

    new InputManager(
      this.engine.renderer.domElement, this.stage.camera,
      () => this.controller!.getCPUPositions(), () => this.controller!.getCount(),
      (idx) => { this.selectedIndex = idx !== activeSet.user.index ? idx : null; useUiStore.getState().setSelectedNpc(this.selectedIndex); },
      (x, z) => this.driverManager?.getPlayerDriver().onFloorClick(x, z),
      (idx, pos) => useUiStore.getState().setHoveredNpc(idx, pos),
      () => this.poiManager.getAllPois(),
      (id, label, pos) => useUiStore.getState().setHoveredPoi(id, label, pos),
      (id) => this.driverManager?.getPlayerDriver().onPoiClick(id),
      this.worldManager.getOffice() ?? undefined, (p) => this.navMesh.isPointOnNavMesh(p)
    );

    this.engine.renderer.setAnimationLoop(this.animate.bind(this));

    this.unsubs.push(useUiStore.subscribe((s, prev) => {
      if (s.instanceCount !== prev.instanceCount) this.controller?.setInstanceCount(s.instanceCount);

      // Monitor individual agent status changes for autonomous animations
      if (s.agentStatuses !== prev.agentStatuses && this.controller) {
        Object.keys(s.agentStatuses).forEach(key => {
          const idx = parseInt(key);
          const status = s.agentStatuses[idx];
          const prevStatus = prev.agentStatuses[idx];
          if (status !== prevStatus) {
             if (status === 'talking') this.setNpcTalking(idx, true);
             else if (prevStatus === 'talking') this.setNpcTalking(idx, false);
          }
        });
      }
    }));
  }

  /** 
   * SMART DESK ASSIGNMENT
   * Attempts to find a work POI. If work-${index} is missing, it picks 
   * a desk from the 'sit_work' group based on the agent's unique index.
   */
  public setNpcWorking(index: number, working: boolean): void {
    if (!this.controller) return;
    if (working) {
      const id = `sit_work-${index}`;
      let poi = this.poiManager.getPoi(id);
      if (!poi) {
         // Smart fallback: assign a desk based on order (agent index is 1-based)
         const desks = this.poiManager.getPoisByPrefix('sit_work');
         if (desks.length > 0) poi = desks[(index - 1) % desks.length];
      }
      if (poi) this.controller.walkToPoi(index, poi.id);
    }
  }
  
  public setNpcTalking(index: number, talking: boolean): void {
    if (!this.controller) return;
    if (talking) {
      if (this.controller.getState(index) !== 'walk') this.controller.play(index, 'talk');
      this.controller.setSpeaking(index, true);
    } else {
      this.controller.setSpeaking(index, false);
      const task = useCoreStore.getState().tasks.find(t => t.status === 'on_hold' && t.assignedAgentId === index);
      this.controller.play(index, task ? 'listen' : 'idle');
    }
  }

  public moveNpcToBoardroom(index: number): void {
    if (!this.controller) return;
    const poi = this.poiManager.getPoi('area-boardroom') || this.poiManager.getPoi('boardroom');
    if (poi) {
      this.controller.walkToPoi(index, poi.id, () => {
        const core = useCoreStore.getState();
        const t = core.tasks.find(t => t.status === 'on_hold' && t.assignedAgentId === index);
      });
    }
  }

  public moveNpcToSpawn(index: number, onArrival?: () => void): void {
    if (!this.controller) return;
    const poi = this.poiManager.getPoi(`spawn-${index}`);
    if (poi) this.controller.moveTo(index, poi.position, 'idle', onArrival, undefined, poi.quaternion);
    else if (onArrival) onArrival();
  }

  private onResize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.stage.onResize(w, h);
    if (!useCoreStore.getState().isResizing) this.engine.onResize(w, h);
  }

  private animate() {
    this.engine.timer.update(); const delta = this.engine.timer.getDelta();
    this.stage.update(); this.controller?.update(delta, this.engine.renderer);
    this.controller?.syncFromGPU(this.engine.renderer).then((pos) => {
      if (!pos || !this.controller) return;
      this.controller.updatePaths(pos); this.driverManager?.update(pos, delta);
      this.updateTransparency(pos, delta);
    });
    const player = getActiveAgentSet().user.index;
    this.stage.setFollowTarget(this.controller?.getCPUPosition(this.selectedIndex ?? player) ?? null);
    const { selectedNpcIndex, setSelectedPosition, selectedPosition } = useUiStore.getState();
    const npcScreenPositions: Record<number, { x: number; y: number }> = {};
    const rect = this.container.getBoundingClientRect();
    if (this.controller) {
      for (let i = 0; i < this.controller.getCount(); i++) {
        const p = this.controller.getCPUPosition(i);
        if (p) {
          const s = p.clone(); s.y += BUBBLE_Y_OFFSET; s.project(this.stage.camera);
          npcScreenPositions[i] = { x: (s.x * 0.5 + 0.5) * rect.width, y: (s.y * -0.5 + 0.5) * rect.height };
        }
      }
      useUiStore.setState({ npcScreenPositions });
    }
    if (selectedNpcIndex !== null && npcScreenPositions[selectedNpcIndex]) {
      const p = npcScreenPositions[selectedNpcIndex];
      if (Math.abs(p.x - (selectedPosition?.x ?? 0)) > 0.5 || Math.abs(p.y - (selectedPosition?.y ?? 0)) > 0.5) setSelectedPosition(p);
    } else if (selectedPosition !== null) setSelectedPosition(null);
    // No conversation mode here: there is nothing to talk to, the agents run server-side.
    this.stage.setChatMode(false, this.controller?.getAgentState(player) === AgentBehavior.GOTO);
    this.engine.render(this.stage.scene, this.stage.camera);
  }

  private updateTransparency(pos: Float32Array, delta: number) {
    if (!this.controller) return;
    const count = this.controller.getCount(), buffer = this.controller.getAgentStateBuffer();
    if (!buffer) return;
    for (let i = 0; i < count; i++) {
      let overlap = false;
      for (let j = 0; j < count; j++) {
        if (i === j) continue;
        if ((pos[i * 4] - pos[j * 4]) ** 2 + (pos[i * 4 + 2] - pos[j * 4 + 2]) ** 2 < 0.36) { overlap = true; break; }
      }
      const cur = buffer.getAlpha(i), tar = overlap ? 0.4 : 1.0;
      if (Math.abs(cur - tar) > 0.01) buffer.setAlpha(i, THREE.MathUtils.lerp(cur, tar, Math.min(delta * 2.0, 1.0)));
    }
  }

  public resetScene() {
    if (!this.controller) return;
    const set = getActiveAgentSet();
    getAllAgents(set).forEach((a) => this.controller?.setSpeaking(a.index, false));
    this.controller.warpAllToSpawn(set.user.index, getAllAgents(set).map(a => a.index));
    this.stage.setFollowTarget(null);
    this.stage.setChatMode(false, false);
  }

  public dispose() { this.isDisposed = true; this.resizeObserver.disconnect(); this.unsubs.forEach(u => u()); this.driverManager?.dispose(); this.engine.dispose(); }
}
