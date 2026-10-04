import type { Point, PointerSample } from './types.js';

/** @public */
export interface MoveState {
  readonly timestamp: number;
  readonly position: Point;
  readonly delta: Point;
  readonly pointerType: PointerSample['pointerType'];
  readonly pressure: number;
  readonly modifiers: PointerSample['modifiers'];
}

/** @public */
export function moveState(sample: PointerSample): MoveState | null {
  if (sample.phase !== 'move') return null;
  return {
    timestamp: sample.timestamp,
    position: sample.position,
    delta: sample.delta,
    pointerType: sample.pointerType,
    pressure: sample.pressure,
    modifiers: sample.modifiers,
  };
}
