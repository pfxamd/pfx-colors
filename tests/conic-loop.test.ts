import { describe, expect, it } from "vitest";
import { gradientExport } from "../src/app/gradient-export";
import { createGradient, gradientToCss, sampleGradient } from "../src/rust/operations";
import {
  closeConicGradient, conicEditableLimit, prepareConicStops,
} from "../src/app/conic-loop";

describe("Seamless Conic interpolation", () => {
  const input = [
    { color: "#fbba08", position: 0 },
    { color: "#ec1695", position: 0.5 },
    { color: "#a31ce0", position: 1 },
  ];

  it("places all editable stops before the closing arc while preserving their order", () => {
    const prepared = prepareConicStops(input);
    expect(prepared).toHaveLength(input.length);
    expect(prepared.map(stop => stop.position)).toEqual([
      0, conicEditableLimit(3) / 2, conicEditableLimit(3),
    ]);
    expect(input[2].position).toBe(1);
    expect(prepareConicStops(prepared)).toEqual(prepared);
  });

  it("closes at 360 degrees without adding a fourth editable stop", () => {
    const editor = createGradient(prepareConicStops(input), {
      type: "conic", angle: 239, centerX: 0.57, centerY: 0.36,
      interpolationSpace: "oklch", hue: "shorter",
    });
    const painted = closeConicGradient(editor);
    expect(editor.stops).toHaveLength(3);
    expect(painted.stops).toHaveLength(4);
    expect(painted.stops[3].position).toBe(1);
    expect(painted.stops[3].hex).toBe(painted.stops[0].hex);
    expect(painted.stops[3].source).toEqual(painted.stops[0].source);
    expect(sampleGradient(painted, 0).hex).toBe(sampleGradient(painted, 1).hex);
    expect(gradientToCss(painted)).toContain("conic-gradient(");
    expect(gradientToCss(painted)).toContain("100%");
    const exported = JSON.parse(gradientExport(editor));
    expect(exported.seamless).toBe(true);
    expect(exported.stops).toHaveLength(3);
    expect(exported.closingStop.position).toBe(100);
    expect(exported.closingStop.hex).toBe(exported.stops[0].hex);
    expect(closeConicGradient(editor).stops).toEqual(painted.stops);
  });

  it("handles old persisted Conic stops at 100% without a hard closing boundary", () => {
    const old = createGradient(input, { type: "conic" });
    const painted = closeConicGradient(old);
    expect(painted.stops[painted.stops.length - 2].position).toBeLessThan(1);
    expect(painted.stops.at(-1)?.hex).toBe(painted.stops[0].hex);
  });

  it("leaves linear and radial stops completely unchanged", () => {
    for (const type of ["linear", "radial"] as const) {
      const gradient = createGradient(input, { type });
      expect(closeConicGradient(gradient)).toBe(gradient);
      expect(gradient.stops.at(-1)?.position).toBe(1);
    }
  });

  it("supports translucent stop colors and a guaranteed closing segment", () => {
    const source = createGradient(prepareConicStops([
      { color: "rgb(10 20 30 / 0.25)", position: 0 },
      { color: "rgb(200 110 30 / 0.8)", position: 1 },
    ]), { type: "conic", interpolationSpace: "srgb" });
    const painted = closeConicGradient(source);
    expect(painted.stops.at(-1)?.source.alpha).toBeCloseTo(0.25);
    expect(painted.stops[0].source.alpha).toBe(painted.stops.at(-1)?.source.alpha);
    expect(source.stops.at(-1)?.position).toBe(0.5);
  });
});
