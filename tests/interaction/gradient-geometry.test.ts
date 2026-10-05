import { describe, expect, it } from "vitest";
import { angleFromNormalizedPoint } from "../../src/interaction/use-gradient-geometry";

describe("angleFromNormalizedPoint", () => {
  const center = { x: 0.5, y: 0.5 };

  it("uses CSS gradient angle orientation", () => {
    expect(angleFromNormalizedPoint({ x: 0.5, y: 0 }, center, 400, 200)).toBeCloseTo(0);
    expect(angleFromNormalizedPoint({ x: 1, y: 0.5 }, center, 400, 200)).toBeCloseTo(90);
    expect(angleFromNormalizedPoint({ x: 0.5, y: 1 }, center, 400, 200)).toBeCloseTo(180);
    expect(angleFromNormalizedPoint({ x: 0, y: 0.5 }, center, 400, 200)).toBeCloseTo(270);
  });

  it("accounts for non-square surfaces", () => {
    const angle = angleFromNormalizedPoint({ x: 0.75, y: 0.25 }, center, 400, 200);
    expect(angle).toBeCloseTo(63.4349488);
  });
});
