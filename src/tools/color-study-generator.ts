import {
  colorEngine,
  type ColorInput,
  type ColorValue,
} from "../engine";
import {
  generateHarmony,
  type HarmonyScheme,
} from "./harmony-generator";

export const COLOR_STUDY_COUNT = 10;

export const COLOR_STUDY_SCHEMES = [
  "analogous",
  "split-complementary",
  "triadic",
  "tetradic",
  "square",
] as const satisfies readonly HarmonyScheme[];

export interface ColorStudyColor {
  index: number;
  hex: string;
  value: ColorValue;
  oklch: {
    l: number;
    c: number;
    h: number;
  };
  mapped: boolean;
}

export interface ColorStudyResult {
  seedHex: string;
  scheme: HarmonyScheme;
  colors: ColorStudyColor[];
}

export interface ColorStudyOptions {
  random?: () => number;
  targetSpace?: "srgb" | "p3";
}

const LIGHTNESS_TRACK = [0.62, 0.32, 0.86, 0.48, 0.74, 0.22, 0.92, 0.4, 0.68, 0.56];
const CHROMA_TRACK = [1.0, 0.72, 0.58, 1.18, 0.88, 0.52, 0.4, 1.08, 0.78, 0.94];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function wrapHue(value: number) {
  const hue = value % 360;
  return hue < 0 ? hue + 360 : hue;
}

function asInput(value: ColorValue): ColorInput {
  return {
    space: value.space,
    coordinates: value.coordinates.map((coordinate) => coordinate ?? 0),
    alpha: value.alpha,
  };
}

function distanceFromExisting(candidate: ColorInput, colors: ColorStudyColor[]) {
  if (colors.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(
    ...colors.map((color) =>
      colorEngine.color.difference(candidate, asInput(color.value), "ok").value,
    ),
  );
}

export function generateColorStudy(
  seed: ColorInput,
  options: ColorStudyOptions = {},
): ColorStudyResult {
  const random = options.random ?? Math.random;
  const targetSpace = options.targetSpace ?? "srgb";
  const scheme =
    COLOR_STUDY_SCHEMES[
      Math.min(
        COLOR_STUDY_SCHEMES.length - 1,
        Math.floor(random() * COLOR_STUDY_SCHEMES.length),
      )
    ];

  const seedValue = colorEngine.color.parse(seed);
  const seedOklch = colorEngine.color.convert(seed, "oklch");
  const seedHue =
    seedOklch.coordinates[2] == null
      ? random() * 360
      : Number(seedOklch.coordinates[2]);
  const seedChroma = Number(seedOklch.coordinates[1] ?? 0);
  const workingChroma = clamp(seedChroma * 1.1 + 0.055, 0.07, 0.24);

  const harmony = generateHarmony(
    {
      space: "oklch",
      coordinates: [
        Number(seedOklch.coordinates[0] ?? 0.6),
        workingChroma,
        seedHue,
      ],
      alpha: seedValue.alpha,
    },
    scheme,
    { targetSpace: "p3" },
  );

  const anchorHues = harmony.colors.map((color) => {
    const converted = colorEngine.color.convert(asInput(color.value), "oklch");
    return Number(converted.coordinates[2] ?? seedHue);
  });

  const colors: ColorStudyColor[] = [];

  for (let index = 0; index < COLOR_STUDY_COUNT; index += 1) {
    const anchorHue = anchorHues[(index * 2 + 1) % anchorHues.length];
    let candidate: ColorInput = seed;
    let mapped = false;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const hueJitter = (random() - 0.5) * (attempt === 0 ? 18 : 34);
      const lightnessJitter = (random() - 0.5) * 0.055;
      const chromaJitter = (random() - 0.5) * 0.035;

      const lightness = clamp(
        LIGHTNESS_TRACK[index] + lightnessJitter + attempt * 0.006,
        0.12,
        0.96,
      );
      const chroma = clamp(
        workingChroma * CHROMA_TRACK[index] + chromaJitter,
        index === 6 ? 0.025 : 0.045,
        0.31,
      );
      const hue = wrapHue(anchorHue + hueJitter + attempt * 7);

      candidate = {
        space: "oklch",
        coordinates: [lightness, chroma, hue],
        alpha: seedValue.alpha,
      };

      if (distanceFromExisting(candidate, colors) >= 0.045 || attempt === 7) {
        break;
      }
    }

    mapped = !colorEngine.color.isInGamut(candidate, targetSpace);
    const value = mapped
      ? colorEngine.color.mapToGamut(candidate, {
          targetSpace,
          method: "css",
        })
      : colorEngine.color.convert(candidate, targetSpace);
    const perceptual = colorEngine.color.convert(asInput(value), "oklch");

    colors.push({
      index,
      hex: colorEngine.color.formatHex(asInput(value)),
      value,
      oklch: {
        l: Number(perceptual.coordinates[0] ?? 0),
        c: Number(perceptual.coordinates[1] ?? 0),
        h: Number(perceptual.coordinates[2] ?? 0),
      },
      mapped,
    });
  }

  return {
    seedHex: colorEngine.color.formatHex(seed),
    scheme,
    colors,
  };
}
