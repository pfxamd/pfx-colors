import { describe, expect, it } from "vitest";
import { normalizedXWithinRect } from "../../src/interaction/use-horizontal-track-drag";

describe("normalizedXWithinRect", () => {
  const rect = { left: 100, width: 200 };

  it("maps horizontal pointer position into 0..1", () => {
    expect(normalizedXWithinRect({ x: 100, y: 0 }, rect)).toBe(0);
    expect(normalizedXWithinRect({ x: 200, y: 0 }, rect)).toBe(0.5);
    expect(normalizedXWithinRect({ x: 300, y: 0 }, rect)).toBe(1);
  });

  it("clamps outside positions", () => {
    expect(normalizedXWithinRect({ x: 20, y: 0 }, rect)).toBe(0);
    expect(normalizedXWithinRect({ x: 420, y: 0 }, rect)).toBe(1);
  });

  it("rejects zero-width tracks", () => {
    expect(normalizedXWithinRect({ x: 100, y: 0 }, { left: 100, width: 0 })).toBeNull();
  });
});
