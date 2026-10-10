import type { GradientStopInput, GradientType } from "@pfx/color-core";

export type RandomGradient = {
  type: GradientType;
  angle: number;
  center: { x: number; y: number };
  stops: GradientStopInput[];
};

function unit(random: () => number): number {
  const value = random();
  return Number.isFinite(value) ? Math.max(0, Math.min(value, 1 - Number.EPSILON)) : 0.5;
}

function hslHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): string => {
    const k = (n + ((hue % 360) + 360) % 360 / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return "#" + channel(0) + channel(8) + channel(4);
}

// Keep color relationships intentional rather than combining unrelated random RGB values.
const colorFamilies = [
  [0, 24, 49, 74],     // analogous
  [0, 45, 166, 193],   // split-complementary
  [0, 112, 229, 254],  // triadic
  [0, 35, 175, 204],   // complementary
  [0, -33, -61, -88],  // neighboring hues in the opposite direction
] as const;

export function generateRandomGradient(
  previousHexes: readonly string[] = [],
  random: () => number = Math.random,
): RandomGradient {
  const family = colorFamilies[Math.floor(unit(random) * colorFamilies.length)];
  const seedHue = unit(random) * 360;
  const count = 2 + Math.floor(unit(random) * 3);
  const stops: GradientStopInput[] = Array.from({ length: count }, (_, index) => {
    const familyIndex = Math.round(index * (family.length - 1) / (count - 1));
    const hue = seedHue + family[familyIndex] + (unit(random) - 0.5) * 14;
    const saturation = 60 + unit(random) * 30;
    const lightness = 39 + unit(random) * 27 + (index % 2 === 0 ? 3 : -4);
    const position = index === 0 ? 0 : index === count - 1 ? 1
      : Math.round((index / (count - 1) + (unit(random) - 0.5) * 0.14) * 1000) / 1000;
    return { color: hslHex(hue, saturation, lightness), position };
  });

  // Even a fixed random source cannot produce the exact same colors on two clicks.
  if (stops.length === previousHexes.length &&
    stops.every((stop, i) => stop.color === previousHexes[i].toLowerCase())) {
    for (const stop of stops) {
      const hex = stop.color as string;
      const value = Number.parseInt(hex.slice(1), 16);
      const shifted = ((value + 0x283f79) % 0x1000000).toString(16).padStart(6, "0");
      stop.color = "#" + shifted;
    }
  }

  const types: GradientType[] = ["linear", "radial", "conic"];
  return {
    type: types[Math.floor(unit(random) * types.length)],
    angle: Math.floor(unit(random) * 360),
    center: {
      x: 0.3 + unit(random) * 0.4,
      y: 0.3 + unit(random) * 0.4,
    },
    stops,
  };
}
