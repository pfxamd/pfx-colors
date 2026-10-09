import { describe, expect, it } from "vitest";
import { createGradient } from "../src/rust/operations";
import { gradientCssExport, gradientExport } from "../src/app/gradient-export";

describe("Gradient export", () => {
  const gradient = createGradient([
    { color: "#3256a9", position: 0 },
    { color: "#e19360", position: 0.5 },
    { color: "#faf0db", position: 1 },
  ], { type: "radial", centerX: 0.2, centerY: 0.7, interpolationSpace: "oklch" });

  it("retains type, geometry, stops and source for further editing", () => {
    const json = JSON.parse(gradientExport(gradient));
    expect(json.type).toBe("radial");
    expect(json.center).toEqual({ x: 0.2, y: 0.7 });
    expect(json.interpolation).toBe("oklch");
    expect(json.stops).toHaveLength(3);
    expect(json.stops[1].position).toBe(50);
    expect(json.stops[0].hex).toMatch(/^#[0-9A-F]{6}$/);
    expect(json.stops.every((stop: { source: { space: string } }) => stop.source.space)).toBeTruthy();
  });

  it("creates reusable CSS with a custom property", () => {
    const css = gradientCssExport("linear-gradient(90deg, red, blue)");
    expect(css).toContain("--pfx-gradient: linear-gradient(90deg, red, blue)");
    expect(css).toContain("background: var(--pfx-gradient)");
  });
});
