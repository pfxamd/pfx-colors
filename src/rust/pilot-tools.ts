import {
  colorEngine,
  generateColorStudy as legacyStudy, generateTonalPalette as legacyTonal,
  generateHarmony as legacyHarmony, sampleGradient as legacySample,
  type ColorInput, type ColorValue, type ColorStudyOptions, type ColorStudyResult,
  type TonalPaletteOptions, type PaletteResult, type HarmonyOptions,
  type HarmonyResult, type HarmonyScheme, type GradientDefinition,
} from "@pfx/color-core";
import { pilotMetrics, type RustColor, type RustColorApi } from "./opt-in-engine";

type ColorEntry = { index: number; position: number; hueOffset: number; mapped: boolean; color: RustColor };
type StudyEntry = { index: number; mapped: boolean; color: RustColor; oklch: number[] };
interface RustTools extends RustColorApi {
  tonalPalette(seed: RustColor, options: Record<string, unknown>): ColorEntry[];
  harmony(seed: RustColor, scheme: string, options: Record<string, unknown>): ColorEntry[];
  colorStudy(seed: RustColor, options: Record<string, unknown>): { scheme: string; colors: StudyEntry[] };
  createGradient(stops: Array<{ position: number; color: RustColor }>, options: Record<string, unknown>):
    { sample(position: number): RustColor; dispose(): void };
}
let rust: RustTools | null = null;
export function setPilotToolCore(core: RustColorApi): void { rust = core as RustTools; }
const names: Record<string, string> = {
  p3: "display-p3", a98rgb: "a98-rgb", prophoto: "prophoto-rgb",
};
function toRust(value: ColorInput): RustColor | null {
  const parsed = colorEngine.color.parse(value);
  if (parsed.coordinates.length !== 3 ||
      parsed.coordinates.some(c => c == null || !Number.isFinite(c))) return null;
  return { space: names[parsed.space] ?? parsed.space,
    channels: parsed.coordinates as [number, number, number], alpha: parsed.alpha };
}
function toInput(v: ColorValue): ColorInput {
  return { space: v.space, coordinates: v.coordinates.map(c => c ?? 0), alpha: v.alpha };
}
function fromRust(v: RustColor): ColorValue {
  const id: Record<string, string> = {
    "display-p3": "p3", "a98-rgb": "a98rgb", "prophoto-rgb": "prophoto",
  };
  const space = id[v.space] ?? v.space;
  return colorEngine.color.convert({ space, coordinates: v.channels, alpha: v.alpha }, space);
}
function near(a: ColorValue, b: ColorValue): boolean {
  return a.space === b.space && a.coordinates.every((x, i) =>
    x != null && b.coordinates[i] != null && Math.abs(x - b.coordinates[i]!) < 0.015);
}
function useRust<T>(name: string, old: T, candidate: () => T | null): T {
  if (!rust) return old;
  try {
    const value = candidate();
    if (value !== null) {
      pilotMetrics.rustCalls++;
      pilotMetrics.routes[name] = (pilotMetrics.routes[name] ?? 0) + 1;
      return value;
    }
  } catch { /* Keep original UX on unsupported numerical edge cases. */ }
  pilotMetrics.fallbackCalls++;
  return old;
}
export function generateTonalPalette(seed: ColorInput, options: TonalPaletteOptions = {}): PaletteResult {
  const original = legacyTonal(seed, options);
  return useRust("tonalPalette", original, () => {
    const value = toRust(seed);
    if (!rust || !value) return null;
    const output = rust.tonalPalette(value, {
      count: options.count ?? 9, minLightness: options.minLightness ?? 0.12,
      maxLightness: options.maxLightness ?? 0.96, chromaScale: options.chromaScale ?? 1,
      target: names[options.targetSpace ?? "srgb"] ?? options.targetSpace ?? "srgb", gamut: "css",
    });
    if (output.length !== original.colors.length) return null;
    const colors = output.map(e => {
      const v = fromRust(e.color);
      return { index: e.index, position: e.position, mapped: e.mapped,
        value: v, hex: colorEngine.color.formatHex(toInput(v)) };
    });
    return colors.every((c, i) => near(c.value, original.colors[i].value))
      ? { mode: "tonal", colors } : null;
  });
}
export function generateHarmony(
  seed: ColorInput, scheme: HarmonyScheme, options: HarmonyOptions = {},
): HarmonyResult {
  const original = legacyHarmony(seed, scheme, options);
  return useRust("harmony", original, () => {
    const value = toRust(seed);
    if (!rust || !value) return null;
    const result = rust.harmony(value, scheme === "split-complementary" ? "splitComplementary" : scheme, {
      analogousAngle: options.analogousAngle ?? 30, splitAngle: options.splitAngle ?? 30,
      tetradicAngle: options.tetradicAngle ?? 60,
      target: names[options.targetSpace ?? "srgb"] ?? options.targetSpace ?? "srgb", gamut: "css",
    });
    if (result.length !== original.colors.length) return null;
    const colors = result.map(e => {
      const v = fromRust(e.color);
      return { index: e.index, hueOffset: e.hueOffset, mapped: e.mapped,
        value: v, hex: colorEngine.color.formatHex(toInput(v)) };
    });
    return colors.every((c, i) => near(c.value, original.colors[i].value))
      ? { scheme, baseHue: original.baseHue, colors } : null;
  });
}
export function generateColorStudy(seed: ColorInput, options: ColorStudyOptions = {}): ColorStudyResult {
  if (!rust) return legacyStudy(seed, options);
  try {
    const parsed = toRust(seed);
    if (parsed) {
      const study = rust.colorStudy(parsed, {
        randomSeed: Math.floor((options.random ?? Math.random)() * 4294967296) >>> 0,
        lightness: options.lightness ?? 58, chroma: options.chroma ?? 58,
        hueRange: options.hueRange ?? 58, toneRange: options.toneRange ?? 58,
        target: options.targetSpace === "p3" ? "display-p3" : "srgb", gamut: "css",
      });
      if (study.colors.length === 10) {
        const colors = study.colors.map(e => {
          const value = fromRust(e.color);
          return { index: e.index, mapped: e.mapped, value,
            hex: colorEngine.color.formatHex(toInput(value)),
            oklch: { l: e.oklch[0], c: e.oklch[1], h: e.oklch[2] } };
        });
        pilotMetrics.rustCalls++;
        pilotMetrics.routes.colorStudy = (pilotMetrics.routes.colorStudy ?? 0) + 1;
        return { seedHex: colorEngine.color.formatHex(seed),
          scheme: (study.scheme === "splitComplementary" ? "split-complementary" : study.scheme) as ColorStudyResult["scheme"],
          controls: { lightness: options.lightness ?? 58, chroma: options.chroma ?? 58,
            hueRange: options.hueRange ?? 58, toneRange: options.toneRange ?? 58 }, colors };
      }
    }
  } catch { /* Independent Rust generator cannot handle this input. */ }
  pilotMetrics.fallbackCalls++;
  return legacyStudy(seed, options);
}
export function sampleGradient(gradient: GradientDefinition, at: number): ColorValue {
  const original = legacySample(gradient, at);
  return useRust("gradientSample", original, () => {
    if (!rust) return null;
    const stops = gradient.stops.map(e => {
      const color = toRust(toInput(e.source));
      if (!color) throw new Error("Unsupported stop");
      return { position: e.position, color };
    });
    const h = rust.createGradient(stops, {
      kind: gradient.type, angle: gradient.angle, centerX: gradient.centerX, centerY: gradient.centerY,
      space: names[gradient.interpolationSpace] ?? gradient.interpolationSpace,
      target: names[gradient.targetSpace] ?? gradient.targetSpace,
      hue: gradient.hue ?? "shorter", gamut: "css",
    });
    try {
      const value = fromRust(h.sample(at));
      return near(value, original) ? value : null;
    } finally {
      h.dispose();
    }
  });
}
