import type { Point } from './types.js';

interface SamplePoint {
  readonly value: Point;
  readonly timestamp: number;
}

/** @internal */
export class VelocityTracker {
  private readonly samples: SamplePoint[] = [];

  constructor(private readonly windowMs = 80) {}

  reset(): void {
    this.samples.length = 0;
  }

  add(value: Point, timestamp: number): void {
    this.samples.push({ value, timestamp });
    const cutoff = timestamp - this.windowMs;
    while (this.samples.length > 2 && (this.samples[0]?.timestamp ?? timestamp) < cutoff) {
      this.samples.shift();
    }
  }

  get(): Point {
    if (this.samples.length < 2) return { x: 0, y: 0 };
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last) return { x: 0, y: 0 };
    const dt = (last.timestamp - first.timestamp) / 1000;
    if (dt <= 0) return { x: 0, y: 0 };
    return {
      x: (last.value.x - first.value.x) / dt,
      y: (last.value.y - first.value.y) / dt,
    };
  }
}
