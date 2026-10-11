import type { ColorInput, GradientStopInput } from "@pfx/color-core";

/**
 * A periodic, shape-preserving interpolation through the editable stops.
 *
 * The editor's stops and angular positions are never rewritten here. Only
 * extra *render-only* stops are synthesized, allowing the existing CSS and
 * Rust renderers to approximate the same smooth OKLCH path.
 *
 * Cubic Hermite slopes are periodic and monotone-limited per channel:
 * lightness/chroma/alpha cannot overshoot a segment's end values, and the
 * closing arc shares the first point's tangent. Hue is unwrapped along the
 * CSS "shorter hue" arcs before spline evaluation.
 *
 * If input contains hard stops, starts after 0%, or is ill-defined, retain
 * the original piecewise interpolation instead of guessing user intent.
 */
export type ConvertedOklch = {
  readonly coordinates: readonly (number | null)[];
  readonly alpha: number;
};

type Knot = { l: number; c: number; h: number; a: number };
type Tangent = Knot;
const TAU = Math.PI * 2;
const EPS = 1e-8;
const hueModulo = (h: number) => ((h % 360) + 360) % 360;
const shortHueDelta = (from: number, to: number) => {
  // CSS Color 4 preserves the direction of an exact 180-degree tie.
  let difference = hueModulo(to) - hueModulo(from);
  if (difference > 180) difference -= 360;
  else if (difference < -180) difference += 360;
  return difference;
};

function monotoneSlope(previous: number, next: number, before: number, after: number): number {
  if (previous * next <= 0) return 0;
  // Weighted harmonic mean (PCHIP) limits overshoot for uneven stop spacing.
  const w1 = 2 * after + before;
  const w2 = after + 2 * before;
  return (w1 + w2) / (w1 / previous + w2 / next);
}

function splineChannel(y0: number, y1: number, m0: number, m1: number, span: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * y0
    + (u3 - 2 * u2 + u) * span * m0
    + (-2 * u3 + 3 * u2) * y1
    + (u3 - u2) * span * m1;
}

function oklabDistance(a: Knot, b: Knot): number {
  const ar = a.h * TAU / 360;
  const br = b.h * TAU / 360;
  const da = a.c * Math.cos(ar) - b.c * Math.cos(br);
  const db = a.c * Math.sin(ar) - b.c * Math.sin(br);
  return Math.hypot(a.l - b.l, da, db);
}

function halfway(a: Knot, b: Knot): Knot {
  return {
    l: (a.l + b.l) / 2, c: (a.c + b.c) / 2,
    h: (a.h + b.h) / 2, a: (a.a + b.a) / 2,
  };
}

/**
 * Approximate a closed cubic path with adaptive linear segments.
 * The output is bounded to 129 stops for the editor's 16-color maximum,
 * comfortably below Rust's 256-stop limit.
 */
export function smoothConicStops(
  stops: readonly GradientStopInput[],
  convert: (color: ColorInput) => ConvertedOklch,
): GradientStopInput[] {
  const n = stops.length;
  if (n < 2 || n > 16 || Math.abs(stops[0].position) > EPS ||
    stops.some((s, i) => !Number.isFinite(s.position) ||
      (i > 0 && s.position - stops[i - 1].position < 1e-6)) ||
    stops[n - 1].position >= 1) {
    return [...stops];
  }

  const knots: Knot[] = [];
  for (const stop of stops) {
    const color = convert(stop.color);
    const [l, c, h] = color.coordinates;
    if (l == null || c == null || !Number.isFinite(l) || !Number.isFinite(c) ||
      !Number.isFinite(color.alpha)) return [...stops];
    knots.push({ l, c: Math.max(0, c), h: Number.isFinite(h) ? (h as number) : 0, a: color.alpha });
  }

  // An achromatic point has no meaningful hue. Borrow the nearest chromatic
  // neighbor's hue instead of sweeping through a spurious zero-degree value.
  for (let i = 0; i < n; i++) {
    if (knots[i].c >= 4e-6) continue;
    for (let offset = 1; offset < n; offset++) {
      const before = (i - offset + n) % n;
      const after = (i + offset) % n;
      if (knots[before].c >= 4e-6 || knots[after].c >= 4e-6) {
        knots[i].h = knots[before].c >= 4e-6 ? knots[before].h : knots[after].h;
        break;
      }
    }
  }

  // The unwrapped endpoint may differ by whole rotations (e.g. a full
  // rainbow). Its visual hue is identical to the first control point.
  const unwrapped = [hueModulo(knots[0].h)];
  for (let i = 1; i < n; i++) {
    unwrapped.push(unwrapped[i - 1] + shortHueDelta(knots[i - 1].h, knots[i].h));
  }
  const endHue = unwrapped[n - 1] + shortHueDelta(knots[n - 1].h, knots[0].h);
  const cycleHue = endHue - unwrapped[0];
  for (let i = 0; i < n; i++) knots[i].h = unwrapped[i];

  const properties = ["l", "c", "h", "a"] as const;
  const tangents: Tangent[] = knots.map((point, i) => {
    const prev = (i + n - 1) % n;
    const next = (i + 1) % n;
    const before = i === 0 ? 1 - stops[n - 1].position : stops[i].position - stops[prev].position;
    const after = i === n - 1 ? 1 - stops[i].position : stops[next].position - stops[i].position;
    const slope = {} as Tangent;
    for (const key of properties) {
      const past = key === "h" && i === 0 ? knots[prev].h - cycleHue : knots[prev][key];
      const future = key === "h" && i === n - 1 ? endHue : knots[next][key];
      slope[key] = monotoneSlope(
        (point[key] - past) / before, (future - point[key]) / after, before, after,
      );
    }
    return slope;
  });

  const output: GradientStopInput[] = [stops[0]];
  const maxDepth = n >= 9 ? 3 : n >= 5 ? 4 : 5;
  for (let i = 0; i < n; i++) {
    const following = (i + 1) % n;
    const start = stops[i].position;
    const finish = i === n - 1 ? 1 : stops[following].position;
    const span = finish - start;
    const startColor = knots[i];
    const endColor = i === n - 1 ? { ...knots[0], h: endHue } : knots[following];
    const evaluate = (u: number): Knot => {
      const result = {} as Knot;
      for (const key of properties) {
        result[key] = splineChannel(
          startColor[key], endColor[key], tangents[i][key],
          tangents[following][key], span, u,
        );
      }
      result.c = Math.max(0, result.c);
      result.a = Math.max(0, Math.min(1, result.a));
      return result;
    };

    const append = (u: number, value: Knot) => {
      if (u === 1) {
        // Keep *exact* user colors at editable knots and at the closing seam.
        output.push({ position: finish, color: stops[following].color });
      } else {
        output.push({
          position: start + span * u,
          color: {
            space: "oklch",
            coordinates: [value.l, value.c, hueModulo(value.h)],
            alpha: value.a,
          },
        });
      }
    };

    const refine = (left: number, a: Knot, right: number, b: Knot, depth: number): void => {
      const mid = (left + right) / 2;
      const m = evaluate(mid);
      // A small perceptual error bound keeps CSS, the Rust LUT and the cubic
      // intent close together. Two guaranteed subdivisions protect long arcs.
      const shouldSplit = depth < 2 ||
        (depth < maxDepth &&
          (oklabDistance(m, halfway(a, b)) > 0.003 || Math.abs(m.a - (a.a + b.a) / 2) > 0.008));
      if (shouldSplit) {
        refine(left, a, mid, m, depth + 1);
        refine(mid, m, right, b, depth + 1);
      } else {
        append(right, b);
      }
    };
    refine(0, startColor, 1, endColor, 0);
  }
  return output;
}
