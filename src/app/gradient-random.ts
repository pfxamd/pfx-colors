import type { GradientStopInput, GradientType } from "@pfx/color-core";

export type RandomGradient = {
  type: GradientType;
  angle: number;
  center: { x: number; y: number };
  stops: GradientStopInput[];
};

type Random = () => number;

function unit(random: Random): number {
  const value = random();
  return Number.isFinite(value) ? Math.max(0, Math.min(value, 1 - Number.EPSILON)) : 0.5;
}
function choose(random: Random, count: number): number {
  return Math.floor(unit(random) * count);
}
function range(random: Random, min: number, max: number): number {
  return min + unit(random) * (max - min);
}
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
function hslHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): string => {
    const k = (n + (((hue % 360) + 360) % 360) / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return "#" + channel(0) + channel(8) + channel(4);
}

// A limited set of coherent hue relationships, not independent random RGB channels.
const families = [
  [0, 18, 39, 63],      // close / analogous
  [0, -20, -45, -70],   // reverse analogous
  [0, 32, 155, 181],    // complementary
  [0, 35, 151, 214],    // split complementary
  [0, 106, 225, 245],   // triadic
  [0, 9, -7, 17],       // tonal, near monochrome
  [0, 26, 132, 189],    // warm / cool
] as const;

// Distinct tonal atmospheres keep repeated generations from becoming a parade of neon hues.
const moods = [
  { saturation: 51, lightness: [81, 73, 66, 54] }, // airy
  { saturation: 48, lightness: [75, 62, 71, 51] }, // soft
  { saturation: 79, lightness: [62, 45, 59, 37] }, // vivid
  { saturation: 57, lightness: [47, 31, 49, 23] }, // dusk
  { saturation: 38, lightness: [71, 51, 58, 36] }, // muted / earthy
  { saturation: 71, lightness: [72, 56, 66, 43] }, // luminous
] as const;

function positions(type: GradientType, count: number, random: Random): number[] {
  // Leave a closing arc for conic's automatic transition back to the first color.
  // 3 editable stops allow 2/3 of a turn; 4 allow 3/4.
  const end = type === "conic" ? 1 - 1 / count : 1;
  const curve = type === "radial" ? range(random, 0.75, 1.36)
    : type === "conic" ? range(random, 0.87, 1.12) : range(random, 0.86, 1.15);
  const result = [0];
  for (let index = 1; index < count - 1; index += 1) {
    const t = index / (count - 1);
    const raw = Math.pow(t, curve) * end + range(random, -0.035, 0.035) * end;
    const minimum = result[index - 1] + 0.12 * end;
    const maximum = end - (count - 1 - index) * 0.12 * end;
    result.push(Math.round(clamp(raw, minimum, maximum) * 1000) / 1000);
  }
  result.push(Math.round(end * 1000) / 1000);
  return result;
}

function geometry(type: GradientType, random: Random): Pick<RandomGradient, "angle" | "center"> {
  if (type === "linear") {
    const angles = [0, 30, 45, 65, 90, 115, 135, 155, 180, 205, 225, 250, 270, 300, 315, 340];
    return {
      angle: (Math.round(angles[choose(random, angles.length)] + range(random, -8, 8)) + 360) % 360,
      center: { x: 0.5, y: 0.5 },
    };
  }
  if (type === "radial") {
    const focalPoints = [
      [0.5, 0.5], [0.4, 0.41], [0.61, 0.4],
      [0.39, 0.61], [0.6, 0.61], [0.5, 0.37], [0.5, 0.64],
    ];
    const [x, y] = focalPoints[choose(random, focalPoints.length)];
    return {
      angle: 0,
      center: {
        x: Math.round(clamp(x + range(random, -0.035, 0.035), 0.3, 0.7) * 1000) / 1000,
        y: Math.round(clamp(y + range(random, -0.035, 0.035), 0.3, 0.7) * 1000) / 1000,
      },
    };
  }
  return {
    angle: Math.floor(unit(random) * 360),
    center: {
      x: Math.round(range(random, 0.45, 0.55) * 1000) / 1000,
      y: Math.round(range(random, 0.45, 0.55) * 1000) / 1000,
    },
  };
}

function averageColorDifference(stops: readonly GradientStopInput[], previous: readonly string[]): number {
  if (stops.length !== previous.length) return Infinity;
  let difference = 0;
  for (let i = 0; i < stops.length; i += 1) {
    const next = stops[i].color;
    const old = previous[i];
    if (typeof next !== "string" || !/^#[\da-f]{6}$/i.test(old)) return Infinity;
    for (let channel = 1; channel <= 5; channel += 2) {
      difference += Math.abs(
        Number.parseInt(next.slice(channel, channel + 2), 16) -
        Number.parseInt(old.slice(channel, channel + 2), 16),
      );
    }
  }
  return difference / (stops.length * 3);
}

/** Curated palettes + type-specific geometry. Keeps the selected kind unchanged.
 *  The optional injected RNG makes palette quality and degenerate inputs testable.
 */
export function generateRandomGradient(
  type: GradientType,
  previousHexes: readonly string[] = [],
  random: Random = Math.random,
): RandomGradient {
  // A constant/seeded random source is supported; deterministic retries still
  // move away from a previous near-identical palette without breaking harmony.
  const familyIndex = choose(random, families.length);
  const moodIndex = choose(random, moods.length);
  const seedHue = unit(random) * 360;
  const count = type === "conic" ? 3 + choose(random, 2) : 2 + choose(random, 3);
  const layout = geometry(type, random);
  const stopPositions = positions(type, count, random);

  let stops: GradientStopInput[] = [];
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const family = families[(familyIndex + attempt) % families.length];
    const mood = moods[(moodIndex + attempt) % moods.length];
    stops = Array.from({ length: count }, (_, index) => {
      const sample = Math.round(index * (family.length - 1) / (count - 1));
      const hue = seedHue + attempt * 47 + family[sample] + range(random, -5, 5);
      const saturation = clamp(mood.saturation + range(random, -8, 8), 22, 92);
      const tone = mood.lightness[sample];
      // Radial gradients emphasize a center-to-edge tonal movement.
      const lightness = clamp(tone + (type === "radial" ? (index === 0 ? 5 : -2) : 0)
        + range(random, -3, 3), 20, 88);
      return {
        color: hslHex(hue, saturation, lightness),
        position: stopPositions[index],
      };
    });
    if (averageColorDifference(stops, previousHexes) >= 29) break;
  }
  return { type, ...layout, stops };
}
