import type { Point } from './types.js';
import { clamp as clampValue, stepValue } from './values.js';

/** @public */
export interface PointModifierContext {
  readonly value: Point;
  readonly previous: Point;
  readonly velocity: Point;
}

/** @public */
export type PointModifier = (context: PointModifierContext) => PointModifierContext;

/** @public */
export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

function assertBounds(value: Bounds): void {
  if (value.minX > value.maxX || value.minY > value.maxY) {
    throw new RangeError('bounds min values must be <= max values');
  }
}

/** @public */
export function composePointModifiers(...modifiers: readonly PointModifier[]): PointModifier {
  return (context) => modifiers.reduce((state, modifier) => modifier(state), context);
}

/** @public */
export function axisLock(axis: 'x' | 'y'): PointModifier {
  return (context) => ({
    ...context,
    value:
      axis === 'x'
        ? { x: context.value.x, y: context.previous.y }
        : { x: context.previous.x, y: context.value.y },
    velocity:
      axis === 'x'
        ? { x: context.velocity.x, y: 0 }
        : { x: 0, y: context.velocity.y },
  });
}

/** @public */
export function bounds(boundsValue: Bounds): PointModifier {
  assertBounds(boundsValue);
  return (context) => {
    const x = clampValue(context.value.x, boundsValue.minX, boundsValue.maxX);
    const y = clampValue(context.value.y, boundsValue.minY, boundsValue.maxY);
    return {
      ...context,
      value: { x, y },
      velocity: {
        x: x === context.value.x ? context.velocity.x : 0,
        y: y === context.value.y ? context.velocity.y : 0,
      },
    };
  };
}

function resist(value: number, min: number, max: number, factor: number): number {
  if (value < min) return min + (value - min) * factor;
  if (value > max) return max + (value - max) * factor;
  return value;
}

/** @public */
export function softBounds(boundsValue: Bounds, resistance = 0.2): PointModifier {
  assertBounds(boundsValue);
  if (!Number.isFinite(resistance)) throw new RangeError('resistance must be finite');
  const factor = clampValue(resistance, 0, 1);
  return (context) => ({
    ...context,
    value: {
      x: resist(context.value.x, boundsValue.minX, boundsValue.maxX, factor),
      y: resist(context.value.y, boundsValue.minY, boundsValue.maxY, factor),
    },
  });
}

/** @public */
export function snapPoints(points: readonly Point[], radius: number): PointModifier {
  if (!Number.isFinite(radius) || radius < 0) {
    throw new RangeError('radius must be a finite value >= 0');
  }
  return (context) => {
    let nearest: Point | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const point of points) {
      const pointDistance = Math.hypot(context.value.x - point.x, context.value.y - point.y);
      if (pointDistance < nearestDistance) {
        nearest = point;
        nearestDistance = pointDistance;
      }
    }
    if (!nearest || nearestDistance > radius) return context;
    return { ...context, value: nearest };
  };
}

/** @public */
export type ScalarModifier = (value: number, velocity: number) => number;

/** @public */
export function composeScalarModifiers(...modifiers: readonly ScalarModifier[]): ScalarModifier {
  return (value, velocity) =>
    modifiers.reduce((current, modifier) => modifier(current, velocity), value);
}

/** @public */
export function scalarBounds(min: number, max: number): ScalarModifier {
  if (min > max) throw new RangeError('min must be <= max');
  return (value) => clampValue(value, min, max);
}

/** @public */
export function scalarStep(step: number, origin = 0): ScalarModifier {
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError('step must be a finite value > 0');
  }
  return (value) => stepValue(value, step, origin);
}

/** @public */
export function detents(
  points: readonly number[],
  radius: number,
  velocityEscape = Number.POSITIVE_INFINITY,
): ScalarModifier {
  if (!Number.isFinite(radius) || radius < 0) {
    throw new RangeError('radius must be a finite value >= 0');
  }
  if (Number.isNaN(velocityEscape) || velocityEscape < 0) {
    throw new RangeError('velocityEscape must be >= 0');
  }

  return (value, velocity) => {
    if (Math.abs(velocity) > velocityEscape) return value;
    let nearest = value;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const point of points) {
      const pointDistance = Math.abs(point - value);
      if (pointDistance < nearestDistance) {
        nearest = point;
        nearestDistance = pointDistance;
      }
    }
    return nearestDistance <= radius ? nearest : value;
  };
}
