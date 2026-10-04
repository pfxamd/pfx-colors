import { describe, expect, it } from "vitest";
import { normalizePointWithinRect } from "../../src/interaction/use-normalized-drag-surface";

describe("normalizePointWithinRect", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };

  it("maps client coordinates into normalized surface coordinates", () => {
    expect(normalizePointWithinRect({ x: 200, y: 100 }, rect)).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it("clamps positions outside the interaction surface", () => {
    expect(normalizePointWithinRect({ x: 40, y: 200 }, rect)).toEqual({
      x: 0,
      y: 1,
    });
  });

  it("ignores zero-sized surfaces", () => {
    expect(
      normalizePointWithinRect(
        { x: 100, y: 50 },
        { left: 100, top: 50, width: 0, height: 100 },
      ),
    ).toBeNull();
  });
});
