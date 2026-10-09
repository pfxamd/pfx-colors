import { describe, expect, it } from "vitest";
import { indexFromRgb, rgbFromIndex, rgbPage, RGB_TOTAL, normalizeHex } from "../src/app/color-library";
import { readThemePreference, resolveTheme, THEME_KEY } from "../src/app/theme";

describe("RGB catalog", () => {
  it("can address the full 24-bit gamut with reversible indices", () => {
    for (const index of [0, 1, 2, 15, 256, 54321, 0x7fffff, RGB_TOTAL - 1])
      expect(indexFromRgb(rgbFromIndex(index))).toBe(index);
    expect(rgbPage(0)).toHaveLength(48);
    expect(rgbPage(Math.floor((RGB_TOTAL - 1) / 48))).toHaveLength(16);
  });
  it("rejects invalid indices and HEX and normalizes input", () => {
    expect(() => rgbFromIndex(RGB_TOTAL)).toThrow();
    expect(indexFromRgb("red")).toBeNull();
    expect(normalizeHex(" F8A ")).toBe("#ff88aa");
  });
});

describe("appearance", () => {
  it("follows the OS only for system preference", () => {
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
  it("ignores corrupted preference", () => {
    expect(readThemePreference({ getItem: () => "broken" })).toBe("system");
    expect(readThemePreference({ getItem: key => key === THEME_KEY ? "dark" : null })).toBe("dark");
  });
});
