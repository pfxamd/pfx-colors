import type { ColorRecord } from "./explore-catalog";
import { hexStats } from "./explore-model";
import { hexToRgb, perceptualDistance, rgbToOklch } from "./explore-atlas";

export type ExploreView = "colors" | "scales" | "palettes";
export type HueFamily = "all" | "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "purple" | "pink" | "neutral";
export type ExploreCriteria = {
  query: string;
  group: string;
  family: HueFamily;
  lightMin: number;
  lightMax: number;
  chromaMin: number;
  nearest: boolean;
  reference: string;
};

export type ColorGroup = { name: string; colors: ColorRecord[] };

export function searchExploreColors(colors: readonly ColorRecord[], criteria: ExploreCriteria): ColorRecord[] {
  const needle = criteria.query.trim().toLowerCase().replace(/\s+/g, "");
  const matched: ColorRecord[] = [];
  for (const entry of colors) {
    const [name, hex, group] = entry;
    if (criteria.group !== "all" && group !== criteria.group) continue;
    if (needle && !(name + group).toLowerCase().replace(/\s+/g, "").includes(needle) &&
        !hex.slice(1).toLowerCase().includes(needle.replace(/^#/, ""))) continue;
    if (criteria.family !== "all" && hexStats(hex).family !== criteria.family) continue;
    if (criteria.lightMin > 0 || criteria.lightMax < 100 || criteria.chromaMin > 0) {
      const color = rgbToOklch(hexToRgb(hex));
      if (color.l * 100 < criteria.lightMin || color.l * 100 > criteria.lightMax ||
          color.c * 100 < criteria.chromaMin) continue;
    }
    matched.push(entry);
  }
  if (criteria.nearest && /^#[0-9a-f]{6}$/i.test(criteria.reference)) {
    const distance = new Map<string, number>();
    const score = (hex: string) => {
      const cached = distance.get(hex);
      if (cached !== undefined) return cached;
      const result = perceptualDistance(criteria.reference, hex);
      distance.set(hex, result);
      return result;
    };
    matched.sort((a, b) => score(a[1]) - score(b[1]));
  }
  return matched;
}

/** Retain the original upstream order. Grouping must not sort or invent a new palette. */
export function collectColorGroups(colors: readonly ColorRecord[], view: Exclude<ExploreView, "colors">): ColorGroup[] {
  const groups = new Map<string, ColorRecord[]>();
  for (const color of colors) {
    const key = color[2];
    const list = groups.get(key);
    if (list) list.push(color);
    else groups.set(key, [color]);
  }
  return [...groups].filter(([name, entries]) => {
    if (entries.length < 3 || entries.length > 16) return false;
    const isPalette = name.startsWith("Categorical / ") || name.startsWith("Diverging / ");
    return view === "palettes" ? isPalette : !isPalette;
  }).map(([name, entries]) => ({ name, colors: entries }));
}

export function colorDescription(hex: string) {
  const rgb = hexToRgb(hex);
  const hsl = hexStats(hex);
  const oklch = rgbToOklch(rgb);
  return {
    rgb: "rgb(" + rgb.join(", ") + ")",
    hsl: "hsl(" + Math.round(hsl.hue) + " " + Math.round(hsl.saturation) +
      "% " + Math.round(hsl.lightness) + "%)",
    oklch: "oklch(" + (oklch.l * 100).toFixed(1) + "% " +
      oklch.c.toFixed(3) + " " + Math.round(oklch.h) + ")",
  };
}
