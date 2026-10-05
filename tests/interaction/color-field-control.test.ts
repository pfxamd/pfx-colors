import { describe, expect, it } from "vitest";
import { applyPrecisionDelta } from "../../src/interaction/use-color-field-control";

describe("applyPrecisionDelta", () => {
  it("scales pointer deltas for precision movement", () => {
    expect(
      applyPrecisionDelta(
        { x: 0.5, y: 0.5 },
        { x: 20, y: -10 },
        200,
        100,
        0.2,
      ),
    ).toEqual({ x: 0.52, y: 0.48 });
  });

  it("clamps precision movement to the color field", () => {
    expect(
      applyPrecisionDelta(
        { x: 0.99, y: 0.01 },
        { x: 100, y: -100 },
        100,
        100,
        0.2,
      ),
    ).toEqual({ x: 1, y: 0 });
  });
});
