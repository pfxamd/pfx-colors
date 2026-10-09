/**
 * Branch-only experiment facade.
 * In legacy mode use the unchanged TypeScript implementation; in opt-in mode
 * every COLOR calculation below routes to the pinned Rust WASM engine.
 * CSS serialization is string formatting, not a color computation.
 */
import {
  colorEngine as legacyEngine,
  createGradient as legacyCreateGradient,
  generateColorStudy as legacyStudy,
  generateHarmony as legacyHarmony,
  generateTonalPalette as legacyTonal,
  gradientToCss as legacyGradientToCss,
  sampleGradient as legacySample,
  type ColorInput,
  type ColorValue,
  type ColorStudyOptions,
  type ColorStudyResult,
  type PaletteResult,
  type TonalPaletteOptions,
  type HarmonyResult,
  type HarmonyOptions,
  type HarmonyScheme,
  type GradientStopInput,
  type GradientOptions,
  type GradientDefinition,
  type ColorSpaceId,
} from "@pfx/color-core";

type CoreColor = { space: string; channels: number[]; alpha: number };
type CoreEntry = { index: number; position: number; color: CoreColor; mapped: boolean; hueOffset?: number };
type CoreApi = {
  parseCss(input: string): CoreColor;
  convert(input: CoreColor, target: string): CoreColor;
  formatCss(input: CoreColor): string;
  formatHex(input: CoreColor, method?: string): string;
  isInGamut(input: CoreColor, target: string): boolean;
  mapGamut(input: CoreColor, target: string, method: string): CoreColor;
  colorStudy(input: CoreColor, options: Record<string, unknown>): {
    scheme: string;
    colors: Array<{ index: number; color: CoreColor; oklch: number[]; mapped: boolean }>;
  };
  tonalPalette(input: CoreColor, options: Record<string, unknown>): CoreEntry[];
  harmony(input: CoreColor, scheme: string, options: Record<string, unknown>): CoreEntry[];
  createGradient(stops: Array<{ position: number; color: CoreColor }>, options: Record<string, unknown>): {
    sample(position: number): CoreColor;
    dispose(): void;
  };
  createCssGradient(stops: Array<{ position: number; color: CoreColor }>, options: Record<string, unknown>): {
    samplePixel(x: number, y: number): CoreColor;
    dispose(): void;
  };
};

type Operations = {
  generateColorStudy: typeof legacyStudy;
  generateTonalPalette: typeof legacyTonal;
  generateHarmony: typeof legacyHarmony;
  createGradient: typeof legacyCreateGradient;
  sampleGradient: typeof legacySample;
  convert: (input: ColorInput, target: ColorSpaceId) => ColorValue;
  formatHex: (input: ColorInput) => string;
  rasterizeGradient: (
    gradient: GradientDefinition, width: number, height: number,
  ) => Uint8ClampedArray;
};

const legacy: Operations = {
  generateColorStudy: legacyStudy,
  generateTonalPalette: legacyTonal,
  generateHarmony: legacyHarmony,
  createGradient: legacyCreateGradient,
  sampleGradient: legacySample,
  convert: legacyEngine.color.convert.bind(legacyEngine.color),
  formatHex: legacyEngine.color.formatHex.bind(legacyEngine.color),
  rasterizeGradient: () => {
    throw new Error("Rust pixel renderer is not enabled");
  },
};
let active: Operations = legacy;
const counters: Record<string, number> = {};
const counted = <T>(name: string, action: () => T): T => {
  counters[name] = (counters[name] ?? 0) + 1;
  return action();
};

export function enableRustOperations(core: CoreApi): void {
  const toSpace = (space: string) => space === "p3" ? "display-p3"
    : space === "a98rgb" ? "a98-rgb"
    : space === "prophoto" ? "prophoto-rgb" : space;
  const fromSpace = (space: string) => space === "display-p3" ? "p3"
    : space === "a98-rgb" ? "a98rgb"
    : space === "prophoto-rgb" ? "prophoto" : space;
  const from = (input: ColorInput): CoreColor => typeof input === "string"
    ? core.parseCss(input)
    : { space: toSpace(input.space), channels: [...input.coordinates], alpha: input.alpha ?? 1 };
  const to = (input: CoreColor): ColorValue => ({
    space: fromSpace(input.space),
    coordinates: [...input.channels],
    alpha: input.alpha,
    css: core.formatCss(input),
    hex: core.formatHex(input, "css"),
  });
  const hex = (input: CoreColor) =>
    counted("formatHex", () => core.formatHex(input, "css"));
  const paletteColor = (entry: CoreEntry, index: number) => ({
    index,
    position: entry.position,
    value: to(entry.color),
    hex: hex(entry.color),
    mapped: entry.mapped,
  });
  const sorted = (stops: readonly GradientStopInput[]) => stops.map((entry, index) => ({
    color: from(entry.color), position: entry.position, index,
  })).sort((a, b) => a.position - b.position || a.index - b.index);
  const wrapDefinition = (stops: readonly GradientStopInput[], options: GradientOptions = {}): GradientDefinition => {
    if (stops.length < 2 || stops.length > 256) throw new RangeError("Gradient requires 2..256 stops");
    const type = options.type ?? "linear";
    const target = options.targetSpace ?? "srgb";
    const geometry = {
      type,
      angle: ((options.angle ?? 90) % 360 + 360) % 360,
      centerX: options.centerX ?? 0.5,
      centerY: options.centerY ?? 0.5,
      interpolationSpace: options.interpolationSpace ?? "oklch",
      targetSpace: target,
      hue: options.hue,
    };
    const prepared = sorted(stops).map(({ color, position }, index) => {
      if (!Number.isFinite(position) || position < 0 || position > 1) {
        throw new RangeError("Gradient position outside 0..1");
      }
      const mapped = core.isInGamut(color, toSpace(target))
        ? core.convert(color, toSpace(target))
        : core.mapGamut(color, toSpace(target), "css");
      return {
        index, position, source: to(color), value: to(mapped), hex: hex(mapped),
      };
    });
    // Validate actual Rust gradient handle; all sampling is done by Rust.
    const check = core.createGradient(prepared.map(s => ({
      position: s.position, color: from({
        space: s.source.space, coordinates: s.source.coordinates.map(n => n ?? 0), alpha: s.source.alpha,
      }),
    })), {
      kind: type, angle: geometry.angle, centerX: geometry.centerX, centerY: geometry.centerY,
      space: toSpace(geometry.interpolationSpace), target: toSpace(target),
      hue: geometry.hue ?? "shorter", gamut: "css",
    });
    check.dispose();
    return { ...geometry, stops: prepared };
  };
  const stopsOf = (def: GradientDefinition) => def.stops.map(stop => ({
    position: stop.position,
    color: from({ space: stop.source.space, coordinates: stop.source.coordinates.map(n => n ?? 0), alpha: stop.source.alpha }),
  }));
  const details = (def: GradientDefinition) => ({
    kind: def.type, angle: def.angle, centerX: def.centerX, centerY: def.centerY,
    space: toSpace(def.interpolationSpace), target: toSpace(def.targetSpace),
    hue: def.hue ?? "shorter", gamut: "css",
  });
  const schemes: Record<HarmonyScheme, string> = {
    analogous: "analogous", complementary: "complementary",
    "split-complementary": "splitComplementary",
    triadic: "triadic", tetradic: "tetradic", square: "square",
  };
  active = {
    generateColorStudy(seed: ColorInput, options: ColorStudyOptions = {}): ColorStudyResult {
      return counted("study", () => {
        // Preserve the UI's deterministic seeded random session, while all
        // color generation and gamut mapping execute in the Rust core.
        const randomSeed = Math.floor((options.random?.() ?? Math.random()) * 4294967296) >>> 0;
        const controls = {
          lightness: options.lightness ?? 58, chroma: options.chroma ?? 58,
          hueRange: options.hueRange ?? 58, toneRange: options.toneRange ?? 58,
        };
        const raw = core.colorStudy(from(seed), {
          ...controls, randomSeed, target: toSpace(options.targetSpace ?? "srgb"), gamut: "css",
        });
        return {
          seedHex: hex(from(seed)),
          scheme: (raw.scheme === "splitComplementary" ? "split-complementary" : raw.scheme) as HarmonyScheme,
          controls,
          colors: raw.colors.map(entry => ({
            index: entry.index, hex: hex(entry.color), value: to(entry.color),
            oklch: { l: entry.oklch[0], c: entry.oklch[1], h: entry.oklch[2] },
            mapped: entry.mapped,
          })),
        };
      });
    },
    generateTonalPalette(seed: ColorInput, options: TonalPaletteOptions = {}): PaletteResult {
      return counted("tonal", () => ({
        mode: "tonal",
        colors: core.tonalPalette(from(seed), {
          count: options.count ?? 9, minLightness: options.minLightness ?? 0.12,
          maxLightness: options.maxLightness ?? 0.96,
          chromaScale: options.chromaScale ?? 1,
          target: toSpace(options.targetSpace ?? "srgb"), gamut: "css",
        }).map(paletteColor),
      }));
    },
    generateHarmony(seed: ColorInput, scheme: HarmonyScheme, options: HarmonyOptions = {}): HarmonyResult {
      return counted("harmony", () => {
        const original = from(seed);
        const baseHue = core.convert(original, "oklch").channels[2];
        const colors = core.harmony(original, schemes[scheme], {
          target: toSpace(options.targetSpace ?? "srgb"), gamut: "css",
          analogousAngle: options.analogousAngle ?? 30,
          splitAngle: options.splitAngle ?? 30,
          tetradicAngle: options.tetradicAngle ?? 60,
        });
        return {
          scheme, baseHue,
          colors: colors.map((entry, index) => ({
            index, hueOffset: entry.hueOffset ?? 0,
            value: to(entry.color), hex: hex(entry.color), mapped: entry.mapped,
          })),
        };
      });
    },
    createGradient(stops: readonly GradientStopInput[], options: GradientOptions = {}): GradientDefinition {
      return counted("gradientCreate", () => wrapDefinition(stops, options));
    },
    sampleGradient(def: GradientDefinition, at: number): ColorValue {
      return counted("gradientSample", () => {
        const handle = core.createGradient(stopsOf(def), details(def));
        try { return to(handle.sample(at)); }
        finally { handle.dispose(); }
      });
    },
    convert(input: ColorInput, target: ColorSpaceId): ColorValue {
      return counted("convert", () => to(core.convert(from(input), toSpace(target))));
    },
    formatHex(input: ColorInput): string {
      return counted("formatHex", () => hex(from(input)));
    },
    rasterizeGradient(def: GradientDefinition, width: number, height: number): Uint8ClampedArray {
      return counted("gradientRaster", () => {
        if (!Number.isInteger(width) || !Number.isInteger(height)
          || width <= 0 || height <= 0 || width * height > 32768) {
          throw new RangeError("Experimental gradient raster dimensions are invalid");
        }
        const handle = core.createCssGradient(stopsOf(def), {
          ...details(def), width, height, centerX: def.centerX * width,
          centerY: def.centerY * height, radialShape: "circle",
          radialExtent: "farthest-corner",
        });
        const pixels = new Uint8ClampedArray(width * height * 4);
        try {
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const color = handle.samplePixel(x + 0.5, y + 0.5);
              const i = (y * width + x) * 4;
              pixels[i] = Math.round(Math.max(0, Math.min(1, color.channels[0])) * 255);
              pixels[i + 1] = Math.round(Math.max(0, Math.min(1, color.channels[1])) * 255);
              pixels[i + 2] = Math.round(Math.max(0, Math.min(1, color.channels[2])) * 255);
              pixels[i + 3] = Math.round(color.alpha * 255);
            }
          }
          return pixels;
        } finally { handle.dispose(); }
      });
    },
  };
  // Explicit diagnostic probe used only in branch-based browser verification.
  Object.defineProperty(window, "__PFX_RUST_OPS__", { value: counters, configurable: true });
}

export function isRustExperiment(): boolean { return active !== legacy; }
export function rasterizeGradient(
  gradient: GradientDefinition, width: number, height: number,
): Uint8ClampedArray { return active.rasterizeGradient(gradient, width, height); }
export const generateColorStudy: typeof legacyStudy = (...args) => active.generateColorStudy(...args);
export const generateTonalPalette: typeof legacyTonal = (...args) => active.generateTonalPalette(...args);
export const generateHarmony: typeof legacyHarmony = (...args) => active.generateHarmony(...args);
export const createGradient: typeof legacyCreateGradient = (...args) => active.createGradient(...args);
export const sampleGradient: typeof legacySample = (...args) => active.sampleGradient(...args);
export const gradientToCss: typeof legacyGradientToCss = legacyGradientToCss;
export const colorEngine = {
  color: {
    convert: (input: ColorInput, space: ColorSpaceId) => active.convert(input, space),
    formatHex: (input: ColorInput) => active.formatHex(input),
  },
};
export type { GradientDefinition };
