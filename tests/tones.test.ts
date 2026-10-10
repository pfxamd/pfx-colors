import { describe, expect, it } from "vitest";
import { buildTones, baseToneLightness, DEFAULT_TONES, defaultTonesForSeed,
  toneBoundsForSeed, loadToneConfig,
  textContrast, tonePosition, tonesCss, tonesJson, type ToneConfig } from "../src/app/tones-model";

describe("Tones workspace", () => {
  const options: ToneConfig = { ...DEFAULT_TONES };
  it("produces a deterministic scale through the pinned core", () => {
    const colors = buildTones("#336699", options);
    expect(colors).toHaveLength(9);
    expect(colors[0].hex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(colors[8].hex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(colors[0].hex).not.toEqual(colors[8].hex);
    expect(colors.every((entry, i) => entry.position === i / 8)).toBe(true);
    expect(buildTones("#336699", options).map(color => color.hex))
      .toEqual(colors.map(color => color.hex));
  });
  it("clusters shades toward darks or lights while retaining endpoints", () => {
    const dark = buildTones("#486bc6", { ...options, distribution: "shadows" });
    const light = buildTones("#486bc6", { ...options, distribution: "highlights" });
    const even = buildTones("#486bc6", options);
    expect(dark).toHaveLength(9);
    expect(dark[0].hex).toBe(even[0].hex);
    expect(light[8].hex).toBe(even[8].hex);
    expect(dark[4].hex).not.toEqual(light[4].hex);
    expect(tonePosition(0.5, "shadows")).toBeLessThan(0.5);
    expect(tonePosition(0.5, "highlights")).toBeGreaterThan(0.5);
  });
  it("retains the precise seed when locked and supports independent manual edits", () => {
    const source = "#336699";
    const config = { ...options, lockBase: true, min: 0, max: 100 };
    const locked = buildTones(source, config);
    expect(locked.filter(entry => entry.locked)).toHaveLength(1);
    expect(locked.find(entry => entry.locked)?.hex.toLowerCase()).toBe(source);
    expect(baseToneLightness(source)).toBeGreaterThan(0);
    const edited = buildTones(source, config, { 0: { lightness: 82, chroma: 35 } });
    expect(edited[0].edited).toBe(true);
    expect(edited[0].hex).not.toEqual(locked[0].hex);
    expect(edited.filter(entry => entry.locked)).toHaveLength(1);
  });
  it("exports CSS and JSON with stable indices", () => {
    const colors = buildTones("#af531f", { ...options, count: 4 });
    const css = tonesCss(colors), json = JSON.parse(tonesJson(colors));
    expect(css).toContain("--tone-01:");
    expect(css).toContain("--tone-04:");
    expect(json).toHaveLength(4);
    expect(json[3].token).toBe("tone-04");
    expect(json[3].position).toBe(1);
  });
  it("provides a measurable WCAG contrast ratio", () => {
    expect(textContrast("#000000").color).toBe("#ffffff");
    expect(textContrast("#ffffff").color).toBe("#111827");
    expect(textContrast("#000000").ratio).toBeCloseTo(21, 2);
  });
  it("recovers safely from stale settings", () => {
    const defaults = defaultTonesForSeed("#336699");
    expect(loadToneConfig(null)).toEqual(defaults);
    expect(loadToneConfig({ getItem: () => '{"count":-10}' })).toEqual(defaults);
    const valid = { ...DEFAULT_TONES, autoRange: false, count: 12, distribution: "highlights" };
    expect(loadToneConfig({ getItem: () => JSON.stringify(valid) })).toEqual(valid);
  });
  it("centers normal tones around the seed and preserves the exact base shade", () => {
    for (const source of ["#9BD4E6", "#67C363", "#D77CA1", "#5547AC"]) {
      const config = defaultTonesForSeed(source);
      expect(config.min).toBeGreaterThanOrEqual(18);
      expect(config.min).toBeLessThan(baseToneLightness(source));
      expect(config.max).toBeGreaterThan(baseToneLightness(source));
      const tones = buildTones(source, config);
      expect(tones[0].lightness).toBeGreaterThanOrEqual(18);
      expect(tones.some(tone => tone.base && tone.hex.toLowerCase() === source.toLowerCase())).toBe(true);
      expect(tones.filter(tone => tone.base)).toHaveLength(1);
    }
    expect(toneBoundsForSeed("#9BD4E6").min).toBeGreaterThan(40);
  });
  it("migrates old black-to-white settings while keeping chosen controls", () => {
    const previous = { count: 6, min: 8, max: 96, chroma: 120,
      distribution: "shadows", lockBase: false };
    const migrated = loadToneConfig({
      getItem: name => name.endsWith(".v2") ? JSON.stringify(previous) : null,
    }, "#9BD4E6");
    expect(migrated.count).toBe(6);
    expect(migrated.chroma).toBe(120);
    expect(migrated.distribution).toBe("shadows");
    expect(migrated.autoRange).toBe(true);
    expect(migrated.min).toBeGreaterThan(40);
  });
});
