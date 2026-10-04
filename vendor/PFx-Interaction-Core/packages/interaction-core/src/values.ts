/** @public */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) throw new RangeError('min must be <= max');
  return Math.min(max, Math.max(min, value));
}

/** @public */
export function normalize(value: number, min: number, max: number): number {
  if (min === max) return 0;
  return (value - min) / (max - min);
}

/** @public */
export function denormalize(value: number, min: number, max: number): number {
  return min + (max - min) * value;
}

/** @public */
export function mapRange(
  value: number,
  inputMin: number,
  inputMax: number,
  outputMin: number,
  outputMax: number,
): number {
  return denormalize(normalize(value, inputMin, inputMax), outputMin, outputMax);
}

/** @public */
export function wrap(value: number, min: number, max: number): number {
  if (min >= max) throw new RangeError('min must be < max');
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
}

/** @public */
export function applySensitivity(delta: number, sensitivity = 1): number {
  return delta * sensitivity;
}

/** @public */
export function applyPrecision(delta: number, enabled: boolean, factor = 0.1): number {
  if (!Number.isFinite(factor) || factor < 0) {
    throw new RangeError('factor must be a finite value >= 0');
  }
  return enabled ? delta * factor : delta;
}

/** @public */
export function applyCurve(
  normalizedValue: number,
  curve: 'linear' | 'ease-in' | 'ease-out' | 'smoothstep',
): number {
  const value = clamp(normalizedValue, 0, 1);
  switch (curve) {
    case 'ease-in':
      return value * value;
    case 'ease-out':
      return 1 - (1 - value) * (1 - value);
    case 'smoothstep':
      return value * value * (3 - 2 * value);
    default:
      return value;
  }
}

/** @public */
export function stepValue(value: number, step: number, origin = 0): number {
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError('step must be a finite value > 0');
  }
  return origin + Math.round((value - origin) / step) * step;
}
