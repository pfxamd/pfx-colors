import { describe, expect, it } from "vitest";
import type { GradientType } from "@pfx/color-core";
import { generateRandomGradient } from "../src/app/gradient-random";

const kinds: GradientType[] = ["linear", "radial", "conic"];

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("Type-aware curated gradient generator", () => {
  it("keeps the selected kind across hundreds of generated gradients", () => {
    for (const type of kinds) {
      for (let i = 0; i < 250; i += 1) {
        const gradient = generateRandomGradient(type, [], seeded(i * 67 + 9));
        expect(gradient.type).toBe(type);
        expect(gradient.stops.length).toBeGreaterThanOrEqual(type === "conic" ? 3 : 2);
        expect(gradient.stops.length).toBeLessThanOrEqual(4);
        expect(gradient.stops[0].position).toBe(0);
        expect(gradient.stops.every(stop => typeof stop.color === "string" &&
          /^#[0-9a-f]{6}$/.test(stop.color) &&
          stop.position >= 0 && stop.position <= 1)).toBe(true);
        expect(gradient.stops.every((stop, index) =>
          index === 0 || stop.position > gradient.stops[index - 1].position)).toBe(true);
        expect(new Set(gradient.stops.map(stop => stop.color)).size).toBe(gradient.stops.length);
        expect(gradient.angle).toBeGreaterThanOrEqual(0);
        expect(gradient.angle).toBeLessThan(360);
        expect(gradient.center.x).toBeGreaterThanOrEqual(0);
        expect(gradient.center.x).toBeLessThanOrEqual(1);
        expect(gradient.center.y).toBeGreaterThanOrEqual(0);
        expect(gradient.center.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it("makes distinct geometry appropriate to each type", () => {
    for (let seed = 0; seed < 120; seed += 1) {
      const linear = generateRandomGradient("linear", [], seeded(seed + 5));
      expect(linear.center).toEqual({ x: 0.5, y: 0.5 });
      expect(linear.stops.at(-1)?.position).toBe(1);

      const radial = generateRandomGradient("radial", [], seeded(seed + 5));
      expect(radial.angle).toBe(0);
      expect(radial.center.x).toBeGreaterThanOrEqual(0.3);
      expect(radial.center.x).toBeLessThanOrEqual(0.7);
      expect(radial.center.y).toBeGreaterThanOrEqual(0.3);
      expect(radial.center.y).toBeLessThanOrEqual(0.7);
      expect(radial.stops.at(-1)?.position).toBe(1);

      const conic = generateRandomGradient("conic", [], seeded(seed + 5));
      expect(conic.center.x).toBeGreaterThanOrEqual(0.45);
      expect(conic.center.x).toBeLessThanOrEqual(0.55);
      expect(conic.center.y).toBeGreaterThanOrEqual(0.45);
      expect(conic.center.y).toBeLessThanOrEqual(0.55);
      const editableLimit = 1 - 1 / conic.stops.length;
      expect(conic.stops.at(-1)?.position).toBeLessThanOrEqual(editableLimit + 0.001);
      expect(conic.stops.at(-1)?.position).toBeLessThan(1);
    }
  });

  it("avoids repeating a palette even with an identical constant RNG", () => {
    for (const type of kinds) {
      const first = generateRandomGradient(type, [], () => 0.42);
      const second = generateRandomGradient(
        type, first.stops.map(stop => String(stop.color)), () => 0.42);
      expect(second.type).toBe(type);
      expect(second.stops.map(stop => stop.color))
        .not.toEqual(first.stops.map(stop => stop.color));
    }
  });

  it("provides a range of light and dark palettes, not only saturated neon", () => {
    const samples = Array.from({ length: 180 }, (_, i) =>
      generateRandomGradient("linear", [], seeded(i * 219 + 13)));
    const brightness = samples.map(result => {
      const hex = String(result.stops[0].color);
      return [1, 3, 5].reduce((sum, start) =>
        sum + Number.parseInt(hex.slice(start, start + 2), 16), 0) / 3;
    });
    expect(Math.min(...brightness)).toBeLessThan(125);
    expect(Math.max(...brightness)).toBeGreaterThan(175);
  });

  it("handles RNG boundary and non-finite values without invalid colors or geometry", () => {
    for (const type of kinds) {
      for (const value of [0, 1, NaN, Infinity, -Infinity]) {
        const result = generateRandomGradient(type, [], () => value);
        expect(result.type).toBe(type);
        expect(result.stops.every(stop => /^#[0-9a-f]{6}$/.test(String(stop.color)))).toBe(true);
        expect(result.stops.every(stop => Number.isFinite(stop.position))).toBe(true);
        expect(Number.isFinite(result.center.x) && Number.isFinite(result.center.y)).toBe(true);
        expect(Number.isFinite(result.angle)).toBe(true);
      }
    }
  });
});
