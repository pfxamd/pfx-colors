import { describe, expect, it } from "vitest";
import { ColorJsAdapter } from "@pfx/color-core";
import {
  PilotRustColorEngine, type PilotMetrics, type RustColorApi,
} from "../src/rust/opt-in-engine";

function metrics(): PilotMetrics {
  return { status: "rust", rustCalls: 0, fallbackCalls: 0, routes: {} };
}

describe("opt-in Rust parity-gated color adapter", () => {
  const legacy = new ColorJsAdapter();
  const fakeRust = {
    parseCss(input: string) {
      const value = legacy.parse(input);
      return {
        space: value.space,
        channels: value.coordinates as [number, number, number],
        alpha: value.alpha,
      };
    },
    convert(input: { space: string; channels: number[]; alpha: number }, target: string) {
      const v = legacy.convert({
        space: input.space, coordinates: input.channels, alpha: input.alpha,
      }, target);
      return {
        space: v.space, channels: v.coordinates as [number, number, number], alpha: v.alpha,
      };
    },
    isInGamut(input: { space: string; channels: number[]; alpha: number }, target: string) {
      return legacy.isInGamut({
        space: input.space, coordinates: input.channels, alpha: input.alpha,
      }, target);
    },
    formatHex(input: { space: string; channels: number[]; alpha: number }) {
      return legacy.formatHex({ space: input.space, coordinates: input.channels, alpha: input.alpha });
    },
  } as RustColorApi;

  it("routes supported conversions and gamut operations, preserves HEX metadata", () => {
    const m = metrics();
    const engine = new PilotRustColorEngine(legacy, fakeRust, m);
    expect(engine.convert("#336699", "oklab").hex).toBe(legacy.convert("#336699", "oklab").hex);
    expect(engine.isInGamut("#336699", "srgb")).toBe(true);
    expect(m.routes.convert).toBeGreaterThan(0);
    expect(m.routes.gamut).toBeGreaterThan(0);
  });

  it("uses Rust HEX formatting only when output exactly matches the legacy contract", () => {
    const m = metrics();
    const engine = new PilotRustColorEngine(legacy, fakeRust, m);
    expect(engine.formatHex("#336699")).toBe("#336699");
    expect(m.routes.formatHex).toBe(1);
    const mismatched = new PilotRustColorEngine(
      legacy,
      { ...fakeRust, formatHex: () => "#000000" },
      m,
    );
    expect(mismatched.formatHex("#336699")).toBe("#336699");
    expect(m.fallbackCalls).toBe(1);
  });

  it("preserves existing methods and unsupported algorithm fallback", () => {
    const m = metrics();
    const engine = new PilotRustColorEngine(legacy, fakeRust, m);
    expect(engine.formatHex("#336699")).toBe(legacy.formatHex("#336699"));
    expect(engine.contrast("#000", "#fff", "apca").value).toBe(
      legacy.contrast("#000", "#fff", "apca").value);
    expect(engine.difference("#000", "#fff", "itp").value).toBe(
      legacy.difference("#000", "#fff", "itp").value);
    expect(m.fallbackCalls).toBeGreaterThanOrEqual(2);
  });
});
