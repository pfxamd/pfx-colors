import type { ColorInput, PaletteColor } from "@pfx/color-core";
import { colorEngine, generateTonalPalette } from "../rust/operations";

export type ToneDistribution = "even" | "shadows" | "highlights";
export type ToneConfig = {
  count: number;
  min: number;
  max: number;
  chroma: number;
  distribution: ToneDistribution;
  lockBase: boolean;
};
export type ToneOverride = { lightness: number; chroma: number };
export type ToneOverrides = Record<number, ToneOverride>;
export type ToneItem = {
  index: number;
  position: number;
  hex: string;
  source: ColorInput;
  locked: boolean;
  lightness: number;
  chroma: number;
  edited: boolean;
};
export const DEFAULT_TONES: ToneConfig = {
  count: 9, min: 8, max: 96, chroma: 100, distribution: "even", lockBase: false,
};
export const TONES_SETTINGS_KEY = "pfx-colors.tones.v2";

export function loadToneConfig(storage: Pick<Storage, "getItem"> | null): ToneConfig {
  try {
    const raw = storage?.getItem(TONES_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_TONES };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return { ...DEFAULT_TONES };
    const v = value as Partial<ToneConfig>;
    if (typeof v.count !== "number" || !Number.isInteger(v.count) || v.count < 3 || v.count > 16 ||
        typeof v.min !== "number" || typeof v.max !== "number" ||
        v.min < 0 || v.max > 100 || v.min >= v.max ||
        typeof v.chroma !== "number" || !Number.isFinite(v.chroma) ||
        v.chroma < 0 || v.chroma > 180 ||
        !["even", "shadows", "highlights"].includes(v.distribution ?? "") ||
        typeof v.lockBase !== "boolean") return { ...DEFAULT_TONES };
    return { count: v.count, min: v.min, max: v.max, chroma: v.chroma,
      distribution: v.distribution as ToneDistribution, lockBase: v.lockBase };
  } catch { return { ...DEFAULT_TONES }; }
}

export function tonePosition(t: number, distribution: ToneDistribution): number {
  if (distribution === "shadows") return t * t;
  if (distribution === "highlights") return 1 - (1 - t) * (1 - t);
  return t;
}

export function baseToneLightness(seed: ColorInput): number {
  const oklch = colorEngine.color.convert(seed, "oklch");
  return Math.max(0, Math.min(100, Number(oklch.coordinates[0] ?? 0) * 100));
}

function input(color: PaletteColor): ColorInput {
  return { space: color.value.space,
    coordinates: color.value.coordinates.map(v => v ?? 0), alpha: color.value.alpha };
}

export function buildTones(seed: ColorInput, config: ToneConfig, overrides: ToneOverrides = {}): ToneItem[] {
  const { count, min, max, chroma, distribution, lockBase } = config;
  // Keep linear generation identical to the pinned Rust tonal operation.
  // For non-linear distribution, use a high-resolution Rust palette and sample it.
  const precision = distribution === "even" ? count : 201;
  const generated = generateTonalPalette(seed, {
    count: precision, minLightness: min / 100, maxLightness: max / 100, chromaScale: chroma / 100,
  }).colors;
  const positions = Array.from({ length: count }, (_, index) =>
    tonePosition(index / (count - 1), distribution));
  const seedLightness = baseToneLightness(seed);
  const lockedIndex = lockBase && seedLightness >= min - 0.0001 && seedLightness <= max + 0.0001
    ? positions.reduce((best, value, i) => Math.abs(min + (max - min) * value - seedLightness)
       < Math.abs(min + (max - min) * positions[best] - seedLightness) ? i : best, 0)
    : -1;
  const seedHex = colorEngine.color.formatHex(seed);
  return positions.map((position, index) => {
    const locked = index === lockedIndex;
    const custom = locked ? undefined : overrides[index];
    let sample = generated[Math.round(position * (precision - 1))];
    if (custom) {
      // Use the same pinned engine for manual modifications, not an independent JS converter.
      const l = Math.max(0, Math.min(100, custom.lightness)) / 100;
      const lower = Math.max(0, l - 0.00001);
      const upper = Math.min(1, l + 0.00001);
      const choices = generateTonalPalette(seed, {
        count: 2, minLightness: lower, maxLightness: upper,
        chromaScale: Math.max(0, Math.min(180, custom.chroma)) / 100,
      }).colors;
      sample = choices[l >= 1 ? 1 : 0];
    }
    return {
      index, position: index / (count - 1),
      hex: locked ? seedHex : sample.hex,
      source: locked ? seed : input(sample),
      locked,
      lightness: custom?.lightness ?? min + (max - min) * position,
      chroma: custom?.chroma ?? chroma,
      edited: Boolean(custom),
    };
  });
}

export function textContrast(hex: string): { color: "#ffffff" | "#111827"; ratio: number } {
  const r = [1, 3, 5].map(n => Number.parseInt(hex.slice(n, n + 2), 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = r[0] * 0.2126 + r[1] * 0.7152 + r[2] * 0.0722;
  const whiteRatio = 1.05 / (luminance + 0.05);
  // #111827 approximates near-black; calculate actual ratio.
  const ink = [0x11, 0x18, 0x27].map(c => c / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const inkL = ink[0] * 0.2126 + ink[1] * 0.7152 + ink[2] * 0.0722;
  const inkRatio = (luminance + 0.05) / (inkL + 0.05);
  return whiteRatio > inkRatio ? { color: "#ffffff", ratio: whiteRatio }
    : { color: "#111827", ratio: inkRatio };
}

export function tonesCss(colors: readonly ToneItem[]): string {
  return ":root {\n" + colors.map((tone, index) =>
    `  --tone-${String(index + 1).padStart(2, "0")}: ${tone.hex.toUpperCase()};`).join("\n")
    + "\n}";
}
export function tonesJson(colors: readonly ToneItem[]): string {
  return JSON.stringify(colors.map(t => ({ token: "tone-" + String(t.index + 1).padStart(2, "0"),
    hex: t.hex.toUpperCase(), position: t.position })), null, 2);
}
