import { AtlasCoords } from '../types';

// ── Character Visual ─────────────────────────────────────────
/** Vertical offset from position origin to character center (for raycasting/picking). */
export const CHARACTER_Y_OFFSET = 0.9;
/** Vertical offset from position origin to name/chat bubble anchor. */
export const BUBBLE_Y_OFFSET = 1.3;
/** World-space sphere radius used for mouse-picking characters. */
export const PICK_RADIUS = 0.65;
/** World-space sphere radius used for mouse-picking POIs. */
export const POI_PICK_RADIUS = 0.4;

// ── Resource Loading ──────────────────────────────────────────
/** Path to Draco decoders (hosted in public/vendor/). */
export const DRACO_LIB_PATH = `${import.meta.env.BASE_URL}vendor/draco/`;

// ── Expression Atlas ─────────────────────────────────────────
export const ATLAS_COLS = 2;
export const ATLAS_ROWS = 4;
/** Atlas cell used for the blink frame (eyes closed). */
export const BLINK_FRAME: AtlasCoords = { col: 1, row: 3 };
/** Seconds the blink frame is held. */
export const BLINK_DURATION = 0.15;
/** Seconds per speaking mouth frame. */
export const SPEAKING_FRAME_DURATION = 0.12;
/** Random blink interval range [min, min+range] in seconds. */
export const BLINK_INTERVAL_MIN = 2;
export const BLINK_INTERVAL_RANGE = 3;

// ── Pathfinding & Navigation ─────────────────────────────────
/** Distance (world units) at which a path node is considered reached. */
export const PATH_NODE_ARRIVAL = 0.25;
/** Distance at which player arrival at a GOTO waypoint is detected on CPU. */
export const ARRIVAL_RADIUS = 0.3;
/** Distance at which player↔NPC encounter is triggered. */
export const ENCOUNTER_RADIUS = 1.5;
/** Zone ID used with three-pathfinding. */
export const NAVMESH_ZONE = 'level';

/** Color de fondo de la escena (Three.js) */
export const SCENE_BACKGROUND_COLOR = 0xFaFcFb;
