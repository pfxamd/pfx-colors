import type {
  ColorDifference, ColorEngine, ColorInput, ColorSpaceId, ColorValue,
  ContrastAlgorithm, ContrastResult, DifferenceAlgorithm, GamutMapOptions,
  InterpolationOptions,
} from "@pfx/color-core";

export interface RustColor {
  space: string;
  channels: [number, number, number];
  alpha: number;
}

export interface RustColorApi {
  parseCss(css: string): RustColor;
  convert(color: RustColor, target: string): RustColor;
  difference(first: RustColor, second: RustColor, method: string): number;
  contrast(first: RustColor, second: RustColor): number;
  isInGamut(color: RustColor, target: string): boolean;
  mapGamut(color: RustColor, target: string, method: string): RustColor;
  interpolate(first: RustColor, second: RustColor, amount: number, options: {
    space: string;
    hue: string;
  }): RustColor;
}

export interface PilotMetrics {
  status: "disabled" | "loading" | "rust" | "fallback";
  rustCalls: number;
  fallbackCalls: number;
  routes: Record<string, number>;
  reason?: string;
}

export const pilotMetrics: PilotMetrics = {
  status: "disabled",
  rustCalls: 0,
  fallbackCalls: 0,
  routes: {},
};

const mappedSpaces: Record<string, string> = {
  p3: "display-p3",
  a98rgb: "a98-rgb",
  prophoto: "prophoto-rgb",
};

const allowed = new Set([
  "srgb", "srgb-linear", "display-p3", "display-p3-linear",
  "rec2020", "rec2020-linear", "xyz-d65", "xyz-d50",
  "lab", "lab-d65", "lch", "oklab", "oklch", "hsl", "hwb", "hsv",
  "a98-rgb", "prophoto-rgb",
]);
const coordinatesTolerance: Record<string, number> = {
  lab: 0.07, "lab-d65": 0.07, lch: 0.07,
  hsl: 0.15, hsv: 0.15, hwb: 0.15,
};
const canonical = (space: string): string => mappedSpaces[space] ?? space;

function toRust(input: ColorValue): RustColor | null {
  const space = canonical(input.space);
  if (!allowed.has(space)) return null;
  if (input.coordinates.length < 3 || input.coordinates.some(
    (channel) => channel == null || !Number.isFinite(channel),
  )) return null;
  const coords = input.coordinates as number[];
  if (!Number.isFinite(input.alpha) || input.alpha < 0 || input.alpha > 1) return null;
  return { space, channels: [coords[0], coords[1], coords[2]], alpha: input.alpha };
}

function near(reference: ColorValue, observed: RustColor): boolean {
  if (canonical(reference.space) !== observed.space) return false;
  if (Math.abs(reference.alpha - observed.alpha) > 1e-9) return false;
  const tolerance = coordinatesTolerance[observed.space] ?? 0.005;
  return reference.coordinates.every((value, i) => {
    if (value == null || !Number.isFinite(value)) return false;
    const delta = (
      ((observed.space === "oklch" || observed.space === "lch") && i === 2) ||
      ((observed.space === "hsl" || observed.space === "hwb" || observed.space === "hsv") && i === 0)
    )
      ? Math.abs((((observed.channels[i] - value) + 540) % 360) - 180)
      : Math.abs(observed.channels[i] - value);
    return delta <= (i === 2 && ["oklch", "lch"].includes(observed.space) ? 0.2 : tolerance);
  });
}

/**
 * Experimental parity-gated adapter for the existing PFx ColorEngine contract.
 *
 * - Conversion/mixing/distance/gamut math is attempted in Rust WASM.
 * - The original engine remains the canonical CSS serialization/HEX formatter.
 * - Unsupported spaces, CSS missing components, perceptual delta mismatches
 *   and unusual inputs retain legacy semantics without changing the UI.
 * - This is an explicit opt-in experiment, not a replacement for the release.
 */
export class PilotRustColorEngine implements ColorEngine {
  constructor(
    private readonly legacy: ColorEngine,
    private readonly rust: RustColorApi,
    private readonly metrics: PilotMetrics = pilotMetrics,
  ) {}

  private record(method: string, accepted: boolean): void {
    if (accepted) {
      this.metrics.rustCalls++;
      this.metrics.routes[method] = (this.metrics.routes[method] ?? 0) + 1;
    } else {
      this.metrics.fallbackCalls++;
    }
  }

  private attempt<T>(method: string, original: T, evaluate: () => T | null): T {
    try {
      const value = evaluate();
      if (value != null) {
        this.record(method, true);
        return value;
      }
    } catch {
      // Use the already computed, compatible original result.
    }
    this.record(method, false);
    return original;
  }

  private input(value: ColorInput): RustColor | null {
    return toRust(this.legacy.parse(value));
  }

  parse(input: ColorInput): ColorValue {
    const original = this.legacy.parse(input);
    if (typeof input !== "string") return original;
    return this.attempt("parse", original, () => {
      const parsed = this.rust.parseCss(input);
      if (!near(original, parsed)) return null;
      return { ...original, coordinates: [...parsed.channels] };
    });
  }

  convert(input: ColorInput, targetSpace: ColorSpaceId): ColorValue {
    const original = this.legacy.convert(input, targetSpace);
    return this.attempt("convert", original, () => {
      const color = this.input(input);
      const target = canonical(targetSpace);
      if (!color || !allowed.has(target)) return null;
      const converted = this.rust.convert(color, target);
      if (!near(original, converted)) return null;
      return { ...original, coordinates: [...converted.channels] };
    });
  }

  formatHex(input: ColorInput): string {
    return this.legacy.formatHex(input);
  }

  contrast(
    foreground: ColorInput,
    background: ColorInput,
    algorithm: ContrastAlgorithm = "wcag21",
  ): ContrastResult {
    const original = this.legacy.contrast(foreground, background, algorithm);
    return this.attempt("contrast", original, () => {
      if (algorithm !== "wcag21") return null; // APCA has a separate upstream license.
      const a = this.input(foreground);
      const b = this.input(background);
      if (!a || !b) return null;
      const value = this.rust.contrast(a, b);
      if (Math.abs(value - original.value) > 0.01) return null;
      return { ...original, value };
    });
  }

  difference(
    first: ColorInput,
    second: ColorInput,
    algorithm: DifferenceAlgorithm = "ok",
  ): ColorDifference {
    const original = this.legacy.difference(first, second, algorithm);
    return this.attempt("difference", original, () => {
      const method: Record<string, string> = {
        "76": "cie76", "2000": "ciede2000", ok: "ok",
      };
      if (!method[algorithm]) return null;
      const a = this.input(first), b = this.input(second);
      if (!a || !b) return null;
      const value = this.rust.difference(a, b, method[algorithm]);
      const tolerance = algorithm === "ok" ? 0.005 : 0.15;
      if (Math.abs(original.value - value) > tolerance) return null;
      return { ...original, value };
    });
  }

  interpolate(
    first: ColorInput,
    second: ColorInput,
    amount: number,
    options: InterpolationOptions = {},
  ): ColorValue {
    const original = this.legacy.interpolate(first, second, amount, options);
    return this.attempt("interpolate", original, () => {
      const space = canonical(options.space ?? "oklch");
      const outputSpace = canonical(options.outputSpace ?? "srgb");
      if (!allowed.has(space) || !allowed.has(outputSpace) || options.hue === "raw") return null;
      const a = this.input(first), b = this.input(second);
      if (!a || !b || !Number.isFinite(amount)) return null;
      const mixed = this.rust.interpolate(a, b, Math.max(0, Math.min(1, amount)), {
        space,
        hue: options.hue ?? "shorter",
      });
      const candidate = this.rust.convert(mixed, outputSpace);
      if (!near(original, candidate)) return null;
      return { ...original, coordinates: [...candidate.channels] };
    });
  }

  steps(first: ColorInput, second: ColorInput, count: number, options: InterpolationOptions = {}): ColorValue[] {
    const total = Math.max(2, Math.floor(count));
    if (!Number.isFinite(total) || total > 10000) return this.legacy.steps(first, second, count, options);
    return Array.from({ length: total }, (_, index) =>
      this.interpolate(first, second, index / (total - 1), options));
  }

  isInGamut(input: ColorInput, targetSpace: ColorSpaceId = "srgb"): boolean {
    const original = this.legacy.isInGamut(input, targetSpace);
    return this.attempt("gamut", original, () => {
      const value = this.input(input);
      const target = canonical(targetSpace);
      if (!value || !allowed.has(target)) return null;
      const accepted = this.rust.isInGamut(value, target);
      return accepted === original ? accepted : null;
    });
  }

  mapToGamut(input: ColorInput, options: GamutMapOptions = {}): ColorValue {
    const original = this.legacy.mapToGamut(input, options);
    return this.attempt("mapGamut", original, () => {
      const value = this.input(input);
      const target = canonical(options.targetSpace ?? "srgb");
      if (!value || !allowed.has(target)) return null;
      const converted = this.rust.mapGamut(value, target, options.method ?? "css");
      if (!near(original, converted)) return null;
      return { ...original, coordinates: [...converted.channels] };
    });
  }
}
