import { describe, expect, it } from "vitest";
import { alphaHex, clampChannel, cssHsl, cssOklch, cssRgb, hslRgbUnit, rgbFromHex } from "../src/app/picker-model";
describe("Picker formatting and display geometry", () => {
  it("keeps copied color values stable and preserves alpha", () => {
    expect(rgbFromHex("#336699")).toEqual([51, 102, 153]);
    expect(alphaHex("#336699", 1)).toBe("#336699");
    expect(alphaHex("#336699", .5)).toBe("#33669980");
    expect(cssRgb([51,102,153], 1)).toBe("rgb(51 102 153)");
    expect(cssRgb([51,102,153], .5)).toBe("rgb(51 102 153 / 0.5)");
    expect(cssHsl(210, 50, 40, 1)).toBe("hsl(210 50% 40%)");
    expect(cssOklch(.6,.13,210,1)).toBe("oklch(60% 0.13 210)");
  });
  it("clamps range and maps HSL hue accurately", () => {
    expect(clampChannel(-1,0,100)).toBe(0);
    expect(clampChannel(105,0,100)).toBe(100);
    expect(hslRgbUnit(0, 1, .5)).toEqual([1,0,0]);
    expect(hslRgbUnit(120, 1, .5)).toEqual([0,1,0]);
    expect(hslRgbUnit(240, 1, .5)).toEqual([0,0,1]);
    expect(hslRgbUnit(45, 0, .25)).toEqual([.25,.25,.25]);
  });
});
