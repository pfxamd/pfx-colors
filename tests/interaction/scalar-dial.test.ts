import { describe, expect, it } from "vitest";
import { scalarValueFromAngle } from "../../src/interaction/use-scalar-dial";

describe("scalarValueFromAngle", () => {
  it("maps a full dial into a scalar range", () => {
    expect(scalarValueFromAngle(0, 0, 100, 1)).toBe(0);
    expect(scalarValueFromAngle(180, 0, 100, 1)).toBe(50);
    expect(scalarValueFromAngle(270, 0, 100, 1)).toBe(75);
  });

  it("supports arbitrary ranges and steps", () => {
    expect(scalarValueFromAngle(180, 10, 90, 5)).toBe(50);
  });

  it("clamps invalid dial input into the configured range", () => {
    expect(scalarValueFromAngle(-90, 0, 100, 1)).toBe(0);
    expect(scalarValueFromAngle(450, 0, 100, 1)).toBe(100);
  });
});
