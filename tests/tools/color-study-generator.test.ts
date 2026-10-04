import { describe, expect, it } from "vitest";
import {
  COLOR_STUDY_COUNT,
  COLOR_STUDY_SCHEMES,
  generateColorStudy,
} from "../../src/tools";
import { colorEngine } from "../../src/engine";

describe("generateColorStudy", () => {
  it("creates ten perceptually structured, gamut-safe colors", () => {
    let index = 0;
    const values = [0.13, 0.71, 0.31, 0.88, 0.42, 0.59, 0.22, 0.77];
    const random = () => values[index++ % values.length];

    const study = generateColorStudy("#ff0014", { random });

    expect(study.colors).toHaveLength(COLOR_STUDY_COUNT);
    expect(COLOR_STUDY_SCHEMES).toContain(study.scheme);

    for (const color of study.colors) {
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(colorEngine.color.isInGamut(color.hex, "srgb")).toBe(true);
    }

    const lightness = study.colors.map((color) => color.oklch.l);
    expect(Math.max(...lightness) - Math.min(...lightness)).toBeGreaterThan(0.5);
  });

  it("increases perceptual spread when Tension rises", () => {
    const sequence = [0.18, 0.72, 0.34, 0.91, 0.43, 0.62, 0.27, 0.79];
    const makeRandom = () => {
      let index = 0;
      return () => sequence[index++ % sequence.length];
    };

    const soft = generateColorStudy("#ff0014", {
      tension: 10,
      random: makeRandom(),
    });
    const vivid = generateColorStudy("#ff0014", {
      tension: 90,
      random: makeRandom(),
    });

    const lightnessRange = (values: typeof soft.colors) => {
      const levels = values.map((color) => color.oklch.l);
      return Math.max(...levels) - Math.min(...levels);
    };
    expect(vivid.tension).toBe(90);
    expect(soft.tension).toBe(10);
    expect(lightnessRange(vivid.colors)).toBeGreaterThan(lightnessRange(soft.colors));
    expect(vivid.colors.map((color) => color.hex)).not.toEqual(
      soft.colors.map((color) => color.hex),
    );
  });

  it("uses the seed while changing the generated study", () => {
    const first = generateColorStudy("#336699", { random: () => 0.12 });
    const second = generateColorStudy("#ffb000", { random: () => 0.12 });

    expect(first.seedHex).toBe("#336699");
    expect(second.seedHex).toBe("#ffb000");
    expect(first.colors.map((color) => color.hex)).not.toEqual(
      second.colors.map((color) => color.hex),
    );
  });
});
