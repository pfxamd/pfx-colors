import { describe, expect, it } from "vitest";
import { NAMED_COLORS, RGB_TOTAL } from "../src/app/color-library";
import {
  colorAt, colorIndex, DEFAULT_FILTERS, FAMILY_ANCHORS, hasExploreFilters,
  hexStats, matchHex, namedMatches, pairContrast, statsFromRgb,
} from "../src/app/explore-model";

describe("Explore catalog", () => {
  it("keeps the standard keyword list unique and its spelling aliases intact", () => {
    const canonical = NAMED_COLORS.map(([name]) => name.replaceAll(" ", "").toLowerCase());
    expect(new Set(canonical).size).toBe(148);
    expect(NAMED_COLORS.every(([, hex]) => /^#[0-9a-f]{6}$/.test(hex))).toBe(true);
    const byName = new Map(NAMED_COLORS.map(([name, hex]) => [name.toLowerCase().replaceAll(" ", ""), hex]));
    expect(byName.get("gray")).toBe(byName.get("grey"));
    expect(byName.get("aqua")).toBe(byName.get("cyan"));
    expect(byName.get("fuchsia")).toBe(byName.get("magenta"));
    expect(byName.get("rebeccapurple")).toBe("#663399");
  });

  it("includes all 148 CSS named colors and spelling aliases", () => {
    expect(NAMED_COLORS).toHaveLength(148);
    expect(namedMatches("rebecca", DEFAULT_FILTERS, "name")[0].hex).toBe("#663399");
    expect(namedMatches("royal blue", DEFAULT_FILTERS, "name")[0].hex).toBe("#4169e1");
    expect(namedMatches("grey", DEFAULT_FILTERS, "name").length).toBeGreaterThan(0);
  });
  it("classifies hues, neutrals, temperature and lightness/saturation", () => {
    expect(hexStats("#ff0000").family).toBe("red");
    expect(hexStats("#ffff00").family).toBe("yellow");
    expect(hexStats("#0000ff").family).toBe("blue");
    expect(hexStats("#777777").family).toBe("neutral");
    expect(statsFromRgb(255,0,0).saturation).toBeCloseTo(100);
    expect(statsFromRgb(0,0,0).lightness).toBe(0);
    expect(matchHex("#0000ff", { ...DEFAULT_FILTERS, family: "blue" })).toBe(true);
    expect(matchHex("#ff0000", { ...DEFAULT_FILTERS, family: "blue" })).toBe(false);
    expect(matchHex("#333333", { ...DEFAULT_FILTERS, minLightness: 80 })).toBe(false);
    expect(matchHex("#777777", { ...DEFAULT_FILTERS, minSaturation: 30 })).toBe(false);
    expect(hasExploreFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasExploreFilters({ ...DEFAULT_FILTERS, temperature: "warm" })).toBe(true);
    expect(matchHex(FAMILY_ANCHORS.blue, { ...DEFAULT_FILTERS, family: "blue" })).toBe(true);
  });
  it("addresses the RGB space reversibly in all orders", () => {
    for (const order of ["spectrum", "hex", "reverse"] as const)
      for (const index of [0,1,2,257,32768,8342763,RGB_TOTAL-1]) {
        const color = colorAt(index,order);
        expect(colorIndex(color,order)).toBe(index);
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
      }
    expect(colorAt(0,"hex")).toBe("#000000");
    expect(colorAt(0,"reverse")).toBe("#ffffff");
    expect(() => colorAt(RGB_TOTAL,"hex")).toThrow();
  });
  it("sorts named colors and measures contrast", () => {
    expect(namedMatches("", DEFAULT_FILTERS, "name")[0].name).toBe("Alice Blue");
    expect(namedMatches("", DEFAULT_FILTERS, "hue")).toHaveLength(148);
    expect(namedMatches("",{...DEFAULT_FILTERS,family:"neutral"},"lightness").length).toBeGreaterThan(0);
    expect(pairContrast("#000000","#ffffff")).toBeCloseTo(21,2);
    expect(pairContrast("#ff0000","#ff0000")).toBe(1);
  });
});
