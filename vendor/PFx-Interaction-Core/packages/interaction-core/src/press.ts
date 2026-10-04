import { distance } from './math.js';
import type { PointerSample } from './types.js';

/** @public */
export interface PressState {
  readonly phase: 'start' | 'end' | 'cancel';
  readonly timestamp: number;
  readonly position: PointerSample['position'];
  readonly pointerId: number;
  readonly pointerType: PointerSample['pointerType'];
}

/** @public */
export interface PressOptions {
  readonly maxDistance?: number;
}

/** @public */
export class PressRecognizer {
  private pointer: PointerSample | null = null;
  private readonly maxDistance: number;

  constructor(options: PressOptions = {}) {
    this.maxDistance = options.maxDistance ?? 8;
    if (!Number.isFinite(this.maxDistance) || this.maxDistance < 0) {
      throw new RangeError('maxDistance must be a finite value >= 0');
    }
  }

  handle(sample: PointerSample): PressState | null {
    if (sample.phase === 'down' && this.pointer === null) {
      this.pointer = sample;
      return this.state('start', sample);
    }

    if (!this.pointer || sample.pointerId !== this.pointer.pointerId) return null;

    if (sample.phase === 'move') {
      if (distance(this.pointer.position, sample.position) <= this.maxDistance) return null;
      this.pointer = null;
      return this.state('cancel', sample);
    }

    if (sample.phase === 'cancel') {
      this.pointer = null;
      return this.state('cancel', sample);
    }

    if (sample.phase === 'up') {
      this.pointer = null;
      return this.state('end', sample);
    }

    return null;
  }

  private state(phase: PressState['phase'], sample: PointerSample): PressState {
    return {
      phase,
      timestamp: sample.timestamp,
      position: sample.position,
      pointerId: sample.pointerId,
      pointerType: sample.pointerType,
    };
  }
}
