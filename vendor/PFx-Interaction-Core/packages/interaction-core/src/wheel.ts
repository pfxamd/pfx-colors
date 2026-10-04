import type { Point, WheelDeltaMode, WheelSample } from './types.js';

/** @public */
export interface WheelState {
  readonly timestamp: number;
  readonly position: Point;
  readonly delta: Point;
  readonly deltaMode: WheelDeltaMode;
  readonly direction: Point;
  readonly modifiers: WheelSample['modifiers'];
}

/** @public */
export function wheelState(sample: WheelSample): WheelState {
  const x = sample.delta.x === 0 ? 0 : Math.sign(sample.delta.x);
  const y = sample.delta.y === 0 ? 0 : Math.sign(sample.delta.y);
  return {
    timestamp: sample.timestamp,
    position: sample.position,
    delta: sample.delta,
    deltaMode: sample.deltaMode,
    direction: { x, y },
    modifiers: sample.modifiers,
  };
}
