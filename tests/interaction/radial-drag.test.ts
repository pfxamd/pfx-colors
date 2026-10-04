import { describe, expect, it } from "vitest";
import { angleFromPoint } from "../../src/interaction/use-radial-drag";

describe("angleFromPoint", () => {
  const rect = { left: 100, top: 100, width: 200, height: 200 };

  it("maps the top of the surface to 0 degrees", () => {
    expect(angleFromPoint({ x: 200, y: 100 }, rect)).toBeCloseTo(0);
  });

  it("maps right, bottom and left clockwise", () => {
    expect(angleFromPoint({ x: 300, y: 200 }, rect)).toBeCloseTo(90);
    expect(angleFromPoint({ x: 200, y: 300 }, rect)).toBeCloseTo(180);
    expect(angleFromPoint({ x: 100, y: 200 }, rect)).toBeCloseTo(270);
  });

  it("ignores zero-sized surfaces", () => {
    expect(
      angleFromPoint(
        { x: 200, y: 200 },
        { left: 100, top: 100, width: 0, height: 200 },
      ),
    ).toBeNull();
  });
});
