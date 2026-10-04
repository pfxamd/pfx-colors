import type { Cancelable, MotionState, Scheduler } from './types.js';

/** @public */
export interface SpringConfig {
  readonly stiffness?: number;
  readonly damping?: number;
  readonly mass?: number;
  readonly restSpeed?: number;
  readonly restDistance?: number;
}

/** @public */
export interface InertiaConfig {
  readonly friction?: number;
  readonly minVelocity?: number;
}

function assertDeltaSeconds(deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError('deltaSeconds must be a finite value >= 0');
  }
}

function resolveSpring(config: SpringConfig): Required<SpringConfig> {
  const resolved = {
    stiffness: config.stiffness ?? 220,
    damping: config.damping ?? 28,
    mass: config.mass ?? 1,
    restSpeed: config.restSpeed ?? 0.01,
    restDistance: config.restDistance ?? 0.01,
  };
  if (
    !Number.isFinite(resolved.stiffness) ||
    !Number.isFinite(resolved.damping) ||
    !Number.isFinite(resolved.mass) ||
    !Number.isFinite(resolved.restSpeed) ||
    !Number.isFinite(resolved.restDistance) ||
    resolved.stiffness < 0 ||
    resolved.damping < 0 ||
    resolved.mass <= 0 ||
    resolved.restSpeed < 0 ||
    resolved.restDistance < 0
  ) {
    throw new RangeError('Invalid spring configuration');
  }
  return resolved;
}

function resolveInertia(config: InertiaConfig): Required<InertiaConfig> {
  const resolved = {
    friction: config.friction ?? 8,
    minVelocity: config.minVelocity ?? 0.01,
  };
  if (
    !Number.isFinite(resolved.friction) ||
    !Number.isFinite(resolved.minVelocity) ||
    resolved.friction < 0 ||
    resolved.minVelocity < 0
  ) {
    throw new RangeError('Invalid inertia configuration');
  }
  return resolved;
}

/** @public */
export function springStep(
  state: MotionState,
  target: number,
  deltaSeconds: number,
  config: SpringConfig = {},
): MotionState {
  assertDeltaSeconds(deltaSeconds);
  const { stiffness, damping, mass } = resolveSpring(config);
  const displacement = state.position - target;
  const springForce = -stiffness * displacement;
  const dampingForce = -damping * state.velocity;
  const acceleration = (springForce + dampingForce) / mass;
  const velocity = state.velocity + acceleration * deltaSeconds;
  const position = state.position + velocity * deltaSeconds;
  return { position, velocity };
}

/** @public */
export function inertiaStep(
  state: MotionState,
  deltaSeconds: number,
  config: InertiaConfig = {},
): MotionState {
  assertDeltaSeconds(deltaSeconds);
  const { friction } = resolveInertia(config);
  const decay = Math.exp(-friction * deltaSeconds);
  const nextVelocity = state.velocity * decay;
  const averageVelocity = (state.velocity + nextVelocity) * 0.5;
  return {
    position: state.position + averageVelocity * deltaSeconds,
    velocity: nextVelocity,
  };
}

/** @public */
export interface MotionAnimationOptions {
  readonly scheduler: Scheduler;
  readonly from: MotionState;
  readonly onUpdate: (state: MotionState) => void;
  readonly onComplete?: (state: MotionState) => void;
}

/** @public */
export interface SpringAnimationOptions extends MotionAnimationOptions {
  readonly target: number;
  readonly spring?: SpringConfig;
}

/** @public */
export function animateSpring(options: SpringAnimationOptions): Cancelable {
  const spring = resolveSpring(options.spring ?? {});
  let state = options.from;
  let frame = -1;
  let lastTime = options.scheduler.now();
  let running = true;

  const tick = (timestamp: number) => {
    if (!running) return;
    const dt = Math.min(0.05, Math.max(0, (timestamp - lastTime) / 1000));
    lastTime = timestamp;
    state = springStep(state, options.target, dt, spring);
    if (
      Math.abs(state.velocity) <= spring.restSpeed &&
      Math.abs(state.position - options.target) <= spring.restDistance
    ) {
      state = { position: options.target, velocity: 0 };
      options.onUpdate(state);
      running = false;
      options.onComplete?.(state);
      return;
    }
    options.onUpdate(state);
    frame = options.scheduler.request(tick);
  };

  frame = options.scheduler.request(tick);
  return {
    cancel() {
      if (!running) return;
      running = false;
      options.scheduler.cancel(frame);
    },
    get running() {
      return running;
    },
  };
}

/** @public */
export interface InertiaAnimationOptions extends MotionAnimationOptions {
  readonly inertia?: InertiaConfig;
  readonly min?: number;
  readonly max?: number;
  readonly elasticity?: number;
}

/** @public */
export function animateInertia(options: InertiaAnimationOptions): Cancelable {
  const inertia = resolveInertia(options.inertia ?? {});
  if (Number.isNaN(options.min) || Number.isNaN(options.max)) {
    throw new RangeError('min and max must not be NaN');
  }
  if (options.min !== undefined && options.max !== undefined && options.min > options.max) {
    throw new RangeError('min must be <= max');
  }

  let state = options.from;
  let frame = -1;
  let lastTime = options.scheduler.now();
  let running = true;
  const requestedElasticity = options.elasticity ?? 0;
  if (!Number.isFinite(requestedElasticity)) {
    throw new RangeError('elasticity must be finite');
  }
  const elasticity = Math.min(1, Math.max(0, requestedElasticity));

  const constrain = (next: MotionState): MotionState => {
    if (options.min !== undefined && next.position < options.min) {
      return {
        position: options.min + (next.position - options.min) * elasticity,
        velocity: elasticity === 0 ? 0 : -next.velocity * elasticity,
      };
    }
    if (options.max !== undefined && next.position > options.max) {
      return {
        position: options.max + (next.position - options.max) * elasticity,
        velocity: elasticity === 0 ? 0 : -next.velocity * elasticity,
      };
    }
    return next;
  };

  const tick = (timestamp: number) => {
    if (!running) return;
    const dt = Math.min(0.05, Math.max(0, (timestamp - lastTime) / 1000));
    lastTime = timestamp;
    state = constrain(inertiaStep(state, dt, inertia));
    options.onUpdate(state);
    if (Math.abs(state.velocity) <= inertia.minVelocity) {
      const position = Math.min(
        options.max ?? Number.POSITIVE_INFINITY,
        Math.max(options.min ?? Number.NEGATIVE_INFINITY, state.position),
      );
      state = { position, velocity: 0 };
      options.onUpdate(state);
      running = false;
      options.onComplete?.(state);
      return;
    }
    frame = options.scheduler.request(tick);
  };

  frame = options.scheduler.request(tick);
  return {
    cancel() {
      if (!running) return;
      running = false;
      options.scheduler.cancel(frame);
    },
    get running() {
      return running;
    },
  };
}
