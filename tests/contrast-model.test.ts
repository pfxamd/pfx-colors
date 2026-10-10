import { describe, expect, it } from "vitest";
import { contrastCriteria, readableInk } from "../src/app/contrast-model";

describe("WCAG contrast checker", () => {
  it("treats identical colors as 1:1 and fails every text threshold", () => {
    const result = contrastCriteria("#eeeeee", "#EEEEEE");
    expect(result.ratio).toBeCloseTo(1, 9);
    expect(result.criteria.every(criterion => !criterion.passes)).toBe(true);
  });
  it("passes all AA and AAA criteria for black on white, 21:1", () => {
    const result = contrastCriteria("#000000", "#ffffff");
    expect(result.ratio).toBeCloseTo(21, 7);
    expect(result.criteria.every(criterion => criterion.passes)).toBe(true);
  });
  it("classifies AA text thresholds separately from AAA", () => {
    const result = contrastCriteria("#767676", "#ffffff");
    expect(result.ratio).toBeGreaterThan(4.5);
    expect(result.ratio).toBeLessThan(7);
    expect(result.criteria.map(x=>x.passes)).toEqual([true,true,false,true]);
  });
  it("rejects invalid/transparent input and recommends legible black or white", () => {
    expect(() => contrastCriteria("#fff", "#000000")).toThrow();
    expect(() => contrastCriteria("#00000000", "#ffffff")).toThrow();
    expect(readableInk("#000000")).toBe("#ffffff");
    expect(readableInk("#ffffff")).toBe("#000000");
  });
});
