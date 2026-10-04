/** @public */
export type Unsubscribe = () => void;

/** @public */
export type Subscriber<T> = (value: T, previous: T) => void;

/** @public */
export interface InteractionValue<T> {
  get(): T;
  getPrevious(): T;
  set(value: T, timestamp?: number): void;
  subscribe(subscriber: Subscriber<T>): Unsubscribe;
  getTimestamp(): number;
}

class MutableInteractionValue<T> implements InteractionValue<T> {
  private current: T;
  private previous: T;
  private timestamp: number;
  private readonly subscribers = new Set<Subscriber<T>>();

  constructor(initial: T, timestamp = 0) {
    this.current = initial;
    this.previous = initial;
    this.timestamp = timestamp;
  }

  get(): T {
    return this.current;
  }

  getPrevious(): T {
    return this.previous;
  }

  getTimestamp(): number {
    return this.timestamp;
  }

  set(value: T, timestamp = this.timestamp): void {
    if (Object.is(value, this.current)) {
      this.timestamp = timestamp;
      return;
    }
    const previous = this.current;
    this.previous = previous;
    this.current = value;
    this.timestamp = timestamp;
    for (const subscriber of this.subscribers) subscriber(value, previous);
  }

  subscribe(subscriber: Subscriber<T>): Unsubscribe {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }
}

/** @public */
export function createInteractionValue<T>(initial: T, timestamp = 0): InteractionValue<T> {
  return new MutableInteractionValue(initial, timestamp);
}

/** @public */
export interface ScalarInteractionValue extends InteractionValue<number> {
  getVelocity(): number;
}

class MutableScalarInteractionValue extends MutableInteractionValue<number> implements ScalarInteractionValue {
  private velocity = 0;
  private previousTimestamp: number;

  constructor(initial: number, timestamp = 0) {
    super(initial, timestamp);
    this.previousTimestamp = timestamp;
  }

  override set(value: number, timestamp = this.getTimestamp()): void {
    const previous = this.get();
    const dt = timestamp - this.previousTimestamp;
    this.velocity = dt > 0 ? ((value - previous) / dt) * 1000 : 0;
    this.previousTimestamp = timestamp;
    super.set(value, timestamp);
  }

  getVelocity(): number {
    return this.velocity;
  }
}

/** @public */
export function createScalarValue(initial = 0, timestamp = 0): ScalarInteractionValue {
  return new MutableScalarInteractionValue(initial, timestamp);
}
