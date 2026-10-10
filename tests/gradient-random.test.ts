import { describe, expect, it } from "vitest";
import { generateRandomGradient } from "../src/app/gradient-random";

describe("Random gradient generator", () => {
  it("produces editable gradients with ordered stops, opaque valid HEX and valid geometry", () => {
    for (let i = 0; i <= 100; i++) {
      let step = 0;
      const random = () => ((i * 29 + step++ * 17) % 101) / 100;
      const gradient = generateRandomGradient([], random);
      expect(["linear", "radial", "conic"]).toContain(gradient.type);
      expect(gradient.stops.length).toBeGreaterThanOrEqual(2);
      expect(gradient.stops.length).toBeLessThanOrEqual(4);
      expect(gradient.stops[0].position).toBe(0);
      expect(gradient.stops[gradient.stops.length - 1].position).toBe(1);
      expect(gradient.stops.every(stop => typeof stop.color === "string" &&
        /^#[0-9a-f]{6}$/.test(stop.color) &&
        stop.position >= 0 && stop.position <= 1)).toBe(true);
      expect(gradient.stops.every((stop, index) =>
        index === 0 || stop.position > gradient.stops[index - 1].position)).toBe(true);
      expect(gradient.angle).toBeGreaterThanOrEqual(0);
      expect(gradient.angle).toBeLessThan(360);
      expect(gradient.center.x).toBeGreaterThanOrEqual(0);
      expect(gradient.center.x).toBeLessThanOrEqual(1);
      expect(gradient.center.y).toBeGreaterThanOrEqual(0);
      expect(gradient.center.y).toBeLessThanOrEqual(1);
    }
  });

  it("generates a different palette even when the random sequence repeats", () => {
    const first = generateRandomGradient([], () => 0.42);
    const second = generateRandomGradient(
      first.stops.map(stop => String(stop.color)), () => 0.42);
    expect(second.stops.map(stop => stop.color)).not.toEqual(first.stops.map(stop => stop.color));
  });

  it("clamps random boundaries safely", () => {
    for (const value of [0, 1, NaN]) {
      const gradient = generateRandomGradient([], () => value);
      expect(gradient.stops.length).toBeGreaterThanOrEqual(2);
      expect(gradient.stops.length).toBeLessThanOrEqual(4);
      expect(gradient.stops.every(stop => /^#[0-9a-f]{6}$/.test(String(stop.color)))).toBe(true);
    }
  });
});
