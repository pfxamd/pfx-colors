import type { InteractionPhase } from './types.js';

const VALID_TRANSITIONS: Record<InteractionPhase, readonly InteractionPhase[]> = {
  idle: ['possible', 'start', 'cancel'],
  possible: ['start', 'cancel', 'idle'],
  start: ['update', 'end', 'cancel'],
  update: ['update', 'end', 'cancel'],
  end: ['idle', 'possible', 'start'],
  cancel: ['idle', 'possible', 'start'],
};

/** @internal */
export class InteractionSession {
  private currentPhase: InteractionPhase = 'idle';
  private id = 0;

  get phase(): InteractionPhase {
    return this.currentPhase;
  }

  get sessionId(): number {
    return this.id;
  }

  transition(next: InteractionPhase): InteractionPhase {
    if (!VALID_TRANSITIONS[this.currentPhase].includes(next)) {
      throw new Error(`Invalid interaction transition: ${this.currentPhase} -> ${next}`);
    }
    if (next === 'start' && this.currentPhase !== 'start' && this.currentPhase !== 'update') {
      this.id += 1;
    }
    this.currentPhase = next;
    return next;
  }

  reset(): void {
    this.currentPhase = 'idle';
  }
}
