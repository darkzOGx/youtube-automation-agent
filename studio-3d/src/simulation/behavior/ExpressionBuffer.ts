import { storage } from 'three/tsl';
import * as THREE from 'three/webgpu';
import { AtlasCoords, ExpressionKey } from '../../types';
import {
    ATLAS_COLS, ATLAS_ROWS, BLINK_DURATION, BLINK_FRAME, BLINK_INTERVAL_MIN, BLINK_INTERVAL_RANGE, SPEAKING_FRAME_DURATION
} from '../constants';

export const EXPRESSIONS: Record<ExpressionKey, { eyes: AtlasCoords; mouth: AtlasCoords }> = {
  idle: { eyes: { col: 0, row: 3 }, mouth: { col: 1, row: 3 } },
  listening: { eyes: { col: 1, row: 0 }, mouth: { col: 1, row: 1 } },
  neutral: { eyes: { col: 0, row: 3 }, mouth: { col: 1, row: 2 } },
  surprised: { eyes: { col: 0, row: 2 }, mouth: { col: 0, row: 2 } },
  happy: { eyes: { col: 1, row: 2 }, mouth: { col: 0, row: 3 } },
  sick: { eyes: { col: 0, row: 1 }, mouth: { col: 0, row: 1 } },
  wink: { eyes: { col: 0, row: 0 }, mouth: { col: 0, row: 0 } },
  doubtful: { eyes: { col: 1, row: 0 }, mouth: { col: 0, row: 2 } },
  sad: { eyes: { col: 1, row: 1 }, mouth: { col: 1, row: 0 } },
};

export const SPEAKING_MOUTH_FRAMES: AtlasCoords[] = [
  { col: 1, row: 3 },
  { col: 0, row: 3 },
  { col: 1, row: 2 },
  { col: 0, row: 2 },
];

/**
 * CPU/GPU buffer that stores per-instance expression data.
 * Each instance maps to one vec4:
 *   .x = eye X offset
 *   .y = eye Y offset
 *   .z = mouth X offset
 *   .w = mouth Y offset
 */
export class ExpressionBuffer {
  public readonly array: Float32Array;
  public readonly attribute: THREE.StorageInstancedBufferAttribute;
  public readonly storageNode: any;

  private speakingStates: boolean[] = [];
  private speakingFrames: number[] = [];
  private speakingTimers: number[] = [];
  private blinkTimers: number[] = [];
  private isBlinking: boolean[] = [];
  private currentExpressions: ExpressionKey[] = [];

  constructor(private readonly count: number) {
    this.array = new Float32Array(count * 4);
    this.attribute = new THREE.StorageInstancedBufferAttribute(this.array, 4);
    this.storageNode = storage(this.attribute, 'vec4', count);

    for (let i = 0; i < count; i++) {
      this.speakingStates[i] = false;
      this.speakingFrames[i] = 0;
      this.speakingTimers[i] = 0;
      this.blinkTimers[i] = BLINK_INTERVAL_MIN + Math.random() * BLINK_INTERVAL_RANGE;
      this.isBlinking[i] = false;
      this.setExpression(i, 'idle');
    }
  }

  public setExpression(index: number, name: ExpressionKey) {
    this.currentExpressions[index] = name;
    const config = EXPRESSIONS[name] || EXPRESSIONS.idle;

    // Apply eye offset (unless blinking)
    if (!this.isBlinking[index]) {
      this.setEyeOffset(index, config.eyes);
    }

    // Apply mouth offset (unless speaking)
    if (!this.speakingStates[index]) {
      this.setMouthOffset(index, config.mouth);
    }
  }

  public setSpeaking(index: number, isSpeaking: boolean) {
    this.speakingStates[index] = isSpeaking;
    if (!isSpeaking) {
      // Reset mouth to current expression
      const config = EXPRESSIONS[this.currentExpressions[index]] || EXPRESSIONS.idle;
      this.setMouthOffset(index, config.mouth);
    }
  }

  private setEyeOffset(index: number, coords: AtlasCoords) {
    this.array[index * 4 + 0] = coords.col * (1 / ATLAS_COLS);
    this.array[index * 4 + 1] = 1.0 - (coords.row + 1) * (1 / ATLAS_ROWS);
    this.attribute.needsUpdate = true;
  }

  private setMouthOffset(index: number, coords: AtlasCoords) {
    this.array[index * 4 + 2] = coords.col * (1 / ATLAS_COLS);
    this.array[index * 4 + 3] = 1.0 - (coords.row + 1) * (1 / ATLAS_ROWS);
    this.attribute.needsUpdate = true;
  }

  public update(delta: number) {
    let needsUpdate = false;

    for (let i = 0; i < this.count; i++) {
      // Handle Blinking
      this.blinkTimers[i] -= delta;
      if (this.blinkTimers[i] <= 0) {
        if (!this.isBlinking[i]) {
          this.isBlinking[i] = true;
          this.blinkTimers[i] = BLINK_DURATION;
          this.setEyeOffset(i, BLINK_FRAME);
          needsUpdate = true;
        } else {
          this.isBlinking[i] = false;
          this.blinkTimers[i] = BLINK_INTERVAL_MIN + Math.random() * BLINK_INTERVAL_RANGE;
          const config = EXPRESSIONS[this.currentExpressions[i]] || EXPRESSIONS.idle;
          this.setEyeOffset(i, config.eyes);
          needsUpdate = true;
        }
      }

      // Handle Speaking Animation
      if (this.speakingStates[i]) {
        this.speakingTimers[i] -= delta;
        if (this.speakingTimers[i] <= 0) {
          this.speakingTimers[i] = SPEAKING_FRAME_DURATION;
          this.speakingFrames[i] = (this.speakingFrames[i] + 1) % SPEAKING_MOUTH_FRAMES.length;
          this.setMouthOffset(i, SPEAKING_MOUTH_FRAMES[this.speakingFrames[i]]);
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) {
      this.attribute.needsUpdate = true;
    }
  }
}
