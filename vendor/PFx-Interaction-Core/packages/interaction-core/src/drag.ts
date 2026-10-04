import { distance, normalizeVector, subtract, ZERO_POINT } from './math.js';
import { InteractionSession } from './session.js';
import type { InteractionSnapshot, ModifierKeys, PointerSample, Point } from './types.js';
import { VelocityTracker } from './velocity.js';

/** @public */
export interface DragOptions {
  readonly activationDistance?: number;
}

/** @public */
export class DragRecognizer {
  private readonly session = new InteractionSession();
  private readonly velocity = new VelocityTracker();
  private startPosition: Point = ZERO_POINT;
  private lastPosition: Point = ZERO_POINT;
  private pointerId: number | null = null;
  private pointerType: PointerSample['pointerType'] = 'unknown';
  private lastPressure = 0;
  private lastModifiers: ModifierKeys = { shift: false, alt: false, ctrl: false, meta: false };
  private activationDistance: number;

  constructor(options: DragOptions = {}) {
    this.activationDistance = options.activationDistance ?? 0;
    if (!Number.isFinite(this.activationDistance) || this.activationDistance < 0) {
      throw new RangeError('activationDistance must be a finite value >= 0');
    }
  }

  handle(sample: PointerSample): InteractionSnapshot | null {
    if (sample.phase === 'down') {
      if (this.pointerId !== null) return null;
      this.pointerId = sample.pointerId;
      this.pointerType = sample.pointerType;
      this.lastPressure = sample.pressure;
      this.lastModifiers = sample.modifiers;
      this.startPosition = sample.position;
      this.lastPosition = sample.position;
      this.velocity.reset();
      this.velocity.add(sample.position, sample.timestamp);
      this.session.transition(this.activationDistance > 0 ? 'possible' : 'start');
      return this.snapshot(sample, this.session.phase, ZERO_POINT);
    }

    if (sample.pointerId !== this.pointerId) return null;

    this.lastPressure = sample.pressure;
    this.lastModifiers = sample.modifiers;

    if (sample.phase === 'cancel') {
      const snapshot = this.snapshot(sample, 'cancel', subtract(sample.position, this.lastPosition));
      this.session.transition('cancel');
      this.reset();
      return snapshot;
    }

    if (sample.phase === 'move') {
      const totalDistance = distance(this.startPosition, sample.position);
      if (this.session.phase === 'possible') {
        if (totalDistance < this.activationDistance) {
          this.lastPosition = sample.position;
          this.velocity.add(sample.position, sample.timestamp);
          return this.snapshot(sample, 'possible', sample.delta);
        }
        this.session.transition('start');
      } else if (this.session.phase === 'start') {
        this.session.transition('update');
      }
      const delta = subtract(sample.position, this.lastPosition);
      this.lastPosition = sample.position;
      this.velocity.add(sample.position, sample.timestamp);
      return this.snapshot(sample, this.session.phase === 'start' ? 'start' : 'update', delta);
    }

    if (sample.phase === 'up') {
      const wasActive = this.session.phase === 'start' || this.session.phase === 'update';
      const phase = wasActive ? 'end' : 'cancel';
      const delta = subtract(sample.position, this.lastPosition);
      this.velocity.add(sample.position, sample.timestamp);
      const snapshot = this.snapshot(sample, phase, delta);
      this.session.transition(phase);
      this.reset();
      return snapshot;
    }

    return null;
  }

  cancel(timestamp = 0): InteractionSnapshot | null {
    if (this.pointerId === null) return null;
    const snapshot: InteractionSnapshot = {
      phase: 'cancel',
      timestamp,
      position: this.lastPosition,
      delta: ZERO_POINT,
      offset: subtract(this.lastPosition, this.startPosition),
      distance: distance(this.startPosition, this.lastPosition),
      direction: ZERO_POINT,
      velocity: this.velocity.get(),
      isActive: false,
      pointerType: this.pointerType,
      pointerId: this.pointerId,
      pressure: this.lastPressure,
      modifiers: this.lastModifiers,
    };
    if (this.session.phase !== 'cancel') this.session.transition('cancel');
    this.reset();
    return snapshot;
  }

  private snapshot(
    sample: PointerSample,
    phase: InteractionSnapshot['phase'],
    delta: Point,
  ): InteractionSnapshot {
    const offset = subtract(sample.position, this.startPosition);
    return {
      phase,
      timestamp: sample.timestamp,
      position: sample.position,
      delta,
      offset,
      distance: distance(this.startPosition, sample.position),
      direction: normalizeVector(delta),
      velocity: this.velocity.get(),
      isActive: phase === 'start' || phase === 'update',
      pointerType: sample.pointerType,
      pointerId: sample.pointerId,
      pressure: sample.pressure,
      modifiers: sample.modifiers,
    };
  }

  private reset(): void {
    this.pointerId = null;
    this.pointerType = 'unknown';
    this.lastPressure = 0;
    this.lastModifiers = { shift: false, alt: false, ctrl: false, meta: false };
    this.startPosition = ZERO_POINT;
    this.lastPosition = ZERO_POINT;
    this.velocity.reset();
    this.session.reset();
  }
}
