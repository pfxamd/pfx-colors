import { describe, expect, it } from "vitest";
import {
  TOTAL_RGB, atlasChildren, atlasPath, contrastRatio, discoverHue, gamutMappedHex, hexToRgb, initialExploreColor,
  oklchToRgb, perceptualDistance, relatedShades, rgbToHex, rgbToOklch,
  tileCount, tileHasHex, tileRange, tileRepresentative,
} from "../src/app/explore-atlas";

describe("Explore 2.0: complete RGB atlas", () => {
  it("partitions the RGB space into exhaustive, nonoverlapping 64-way levels", () => {
    const root = atlasChildren(null);
    expect(root).toHaveLength(64);
    expect(root.every(t => t.depth === 2)).toBe(true);
    expect(root.reduce((sum, t) => sum + tileCount(t), 0)).toBe(TOTAL_RGB);
    let tile = root[0];
    for (const depth of [4, 6, 8]) {
      const children = atlasChildren(tile);
      expect(children).toHaveLength(64);
      expect(children.every(t => t.depth === depth)).toBe(true);
      expect(children.reduce((sum, t) => sum + tileCount(t), 0)).toBe(tileCount(tile));
      tile = children[17];
    }
    expect(tileCount(tile)).toBe(1);
    expect(atlasChildren(tile)).toEqual([]);
  });

  it("locates any exact 24-bit color in four steps, including boundaries", () => {
    const candidates = ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#123456", "#8b89aa"];
    let seed = 0x72a9c;
    for (let i = 0; i < 200; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      candidates.push("#" + (seed & 0xffffff).toString(16).padStart(6, "0"));
    }
    for (const hex of candidates) {
      const path = atlasPath(hex);
      expect(path.map(t => t.depth)).toEqual([2, 4, 6, 8]);
      expect(path.every(t => tileHasHex(t, hex))).toBe(true);
      for (let i = 0; i < path.length; i++) {
        const children = atlasChildren(i ? path[i - 1] : null);
        expect(children.filter(t => tileHasHex(t, hex))).toEqual([path[i]]);
      }
      expect(rgbToHex(tileRepresentative(path[3]))).toBe(hex);
      expect(tileRange(path[3])).toEqual({ min: hex, max: hex });
    }
  });

  it("generates only valid exact RGB values from representative tiles", () => {
    for (const tile of atlasChildren(null)) {
      const rgb = tileRepresentative(tile);
      const { min, max } = tileRange(tile);
      const low = hexToRgb(min), high = hexToRgb(max);
      expect(rgb.every((n, i) => n >= low[i] && n <= high[i])).toBe(true);
      expect(rgbToHex(rgb)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("Explore 2.0: perception and contrast", () => {
  it("round-trips sRGB through OKLCH within display quantization", () => {
    for (const hex of ["#123456", "#8b89aa", "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#f1c747"]) {
      const original = hexToRgb(hex);
      const converted = oklchToRgb(rgbToOklch(original));
      expect(converted).not.toBeNull();
      expect(converted!.every((n, i) => Math.abs(n - original[i]) <= 1)).toBe(true);
    }
  });

  it("does not silently treat out-of-gamut chroma as displayable RGB", () => {
    expect(oklchToRgb({ l: .7, c: .4, h: 260 })).toBeNull();
    expect(gamutMappedHex({ l: .7, c: .4, h: 260 })).toMatch(/^#[0-9a-f]{6}$/);
    expect(oklchToRgb({ l: .5, c: 0, h: 0 })).not.toBeNull();
  });

  it("starts near-black exploration with a visible sample without corrupting exact colors", () => {
    expect(initialExploreColor("#010101")).toBe("#4778d6");
    expect(initialExploreColor("#000000")).toBe("#4778d6");
    expect(initialExploreColor("#ffffff")).toBe("#ffffff");
    expect(initialExploreColor("#ff0000")).toBe("#ff0000");

    for (const hue of [28, 100, 150, 205, 260, 310]) {
      const visible = rgbToOklch(hexToRgb(discoverHue("#010101", hue)));
      expect(visible.l).toBeGreaterThan(0.5);
      expect(visible.c).toBeGreaterThan(0.06);
    }
  });

  it("keeps dark neutrals selectable and preserves non-neutral brightness when changing hue", () => {
    expect(rgbToHex(hexToRgb("#000000"))).toBe("#000000");
    const darkRed = rgbToOklch(hexToRgb("#ba3344"));
    const blue = rgbToOklch(hexToRgb(discoverHue("#ba3344", 260)));
    expect(Math.abs(darkRed.l - blue.l)).toBeLessThan(0.03);
    expect(blue.c).toBeGreaterThan(0.07);
  });

  it("computes exact WCAG relative-luminance contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#112233", "#112233")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeGreaterThan(4);
  });

  it("returns unique perceptually related shades without reusing the seed", () => {
    const shades = relatedShades("#577abd");
    expect(shades.length).toBeGreaterThanOrEqual(8);
    expect(new Set(shades).size).toBe(shades.length);
    expect(shades).not.toContain("#577abd");
    expect(shades.every(hex => /^#[0-9a-f]{6}$/.test(hex))).toBe(true);
    expect(perceptualDistance("#000000", "#000000")).toBeCloseTo(0, 7);
    expect(perceptualDistance("#000000", "#ffffff")).toBeGreaterThan(.9);
  });
});
