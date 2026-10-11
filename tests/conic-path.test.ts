import { describe, expect, it } from "vitest";
import type { ColorInput, GradientStopInput } from "@pfx/color-core";
import { smoothConicStops, type ConvertedOklch } from "../src/app/conic-path";

const color = (l: number, c: number, h: number, alpha = 1): ColorInput => ({
  space: "oklch", coordinates: [l, c, h], alpha,
});
const converted = (input: ColorInput): ConvertedOklch => {
  if (typeof input === "string") throw new Error("Expected structured OKLCH color");
  return { coordinates: input.coordinates, alpha: input.alpha ?? 1 };
};
const value = (stop: GradientStopInput) => converted(stop.color);
const three: GradientStopInput[] = [
  { position: 0, color: color(0.7, 0.18, 350, 0.25) },
  { position: 0.32, color: color(0.45, 0.25, 92, 1) },
  { position: 0.72, color: color(0.66, 0.12, 230, 0.8) },
];

describe("Periodic OKLCH path", () => {
  it("preserves exact editable colors, stops and the render-only closure", () => {
    const before = structuredClone(three);
    const rendered = smoothConicStops(three, converted);
    expect(rendered.length).toBeGreaterThan(4);
    expect(rendered[0]).toEqual(three[0]);
    expect(rendered.at(-1)).toEqual({ position: 1, color: three[0].color });
    for (const stop of three) {
      expect(rendered.find(s => s.position === stop.position)).toEqual(stop);
    }
    expect(three).toEqual(before);
    expect(rendered.every((s, i) => i === 0 || s.position > rendered[i - 1].position)).toBe(true);
  });

  it("tracks the short hue arc through 360 degrees without a hue jump", () => {
    const stops = [
      { position: 0, color: color(0.7, 0.15, 350) },
      { position: 0.5, color: color(0.7, 0.15, 10) },
    ];
    const rendered = smoothConicStops(stops, converted);
    for (let i = 1; i < rendered.length; i++) {
      const prev = value(rendered[i - 1]).coordinates[2] ?? 0;
      const next = value(rendered[i]).coordinates[2] ?? 0;
      const delta = ((next - prev + 540) % 360 + 360) % 360 - 180;
      expect(Math.abs(delta)).toBeLessThan(90);
    }
  });

  it("keeps local lightness, chroma and alpha within each original segment", () => {
    const rendered = smoothConicStops(three, converted);
    for (const stop of rendered) {
      const i = stop.position < 0.32 ? 0 : stop.position < 0.72 ? 1 : 2;
      const other = i === 2 ? 0 : i + 1;
      const output = value(stop);
      const a = value(three[i]);
      const b = value(three[other]);
      for (const k of [0, 1]) {
        expect(output.coordinates[k]!).toBeGreaterThanOrEqual(Math.min(a.coordinates[k]!, b.coordinates[k]!) - 1e-9);
        expect(output.coordinates[k]!).toBeLessThanOrEqual(Math.max(a.coordinates[k]!, b.coordinates[k]!) + 1e-9);
      }
      expect(output.alpha).toBeGreaterThanOrEqual(Math.min(a.alpha, b.alpha) - 1e-9);
      expect(output.alpha).toBeLessThanOrEqual(Math.max(a.alpha, b.alpha) + 1e-9);
    }
  });

  it("actually curves intermediate colors instead of recreating a linear transition", () => {
    const stops = [
      { position: 0, color: color(0.55, 0.08, 30) },
      { position: 0.5, color: color(0.75, 0.3, 110) },
    ];
    const rendered = smoothConicStops(stops, converted);
    const at = rendered.find(s => s.position === 0.125);
    expect(at).toBeDefined();
    const quarterChroma = value(at!).coordinates[1]!;
    expect(Math.abs(quarterChroma - (0.08 * 0.75 + 0.3 * 0.25))).toBeGreaterThan(0.001);
  });

  it("never exceeds the core's stop budget at 16 editable colors", () => {
    const many = Array.from({ length: 16 }, (_, i) => ({
      position: i * 0.056,
      color: color(0.52 + 0.19 * Math.sin(i), 0.09 + 0.06 * Math.cos(i) ** 2, i * 77, 0.2 + (i % 5) / 6),
    }));
    const result = smoothConicStops(many, converted);
    expect(result.length).toBeGreaterThan(16);
    expect(result.length).toBeLessThanOrEqual(129);
    expect(result.at(-1)?.position).toBe(1);
    expect(result.every((s, i) => i === 0 || s.position > result[i - 1].position)).toBe(true);
  });

  it("retains original piecewise semantics for hard stops and displaced starts", () => {
    const hard = [three[0], { ...three[1], position: 0.32 }, { ...three[2], position: 0.32 }];
    expect(smoothConicStops(hard, converted)).toEqual(hard);
    const displaced = three.map(s => ({ ...s, position: s.position + 0.1 }));
    expect(smoothConicStops(displaced, converted)).toEqual(displaced);
  });
});
