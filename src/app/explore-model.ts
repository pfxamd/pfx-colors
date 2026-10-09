import { NAMED_COLORS, rgbFromIndex, RGB_TOTAL } from "./color-library";

export type Family = "all" | "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "purple" | "pink" | "neutral";
export type Temperature = "any" | "warm" | "cool" | "neutral";
export type RgbOrder = "spectrum" | "hex" | "reverse";
export type ExploreFilters = {
  family: Family;
  temperature: Temperature;
  minLightness: number;
  maxLightness: number;
  minSaturation: number;
  maxSaturation: number;
};

export const DEFAULT_FILTERS: ExploreFilters = {
  family: "all", temperature: "any",
  minLightness: 0, maxLightness: 100, minSaturation: 0, maxSaturation: 100,
};
export const FAMILY_ANCHORS: Record<Exclude<Family, "all">, string> = {
  red: "#e44847", orange: "#e99932", yellow: "#e0cb44",
  green: "#3cba7d", cyan: "#4bc7d2", blue: "#5472dc",
  purple: "#9c66d8", pink: "#db5a9f", neutral: "#888888",
};

export type ColorStats = { hue: number; saturation: number; lightness: number; family: Exclude<Family, "all">; temperature: Exclude<Temperature,"any"> };

export function statsFromRgb(r: number, g: number, b: number): ColorStats {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const delta = max - min, lightness = (max + min) / 510;
  const saturation = delta === 0 ? 0 : delta / (255 - Math.abs(max + min - 255));
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = ((hue * 60) + 360) % 360;
  }
  let family: Exclude<Family, "all">;
  if (saturation < 0.10) family = "neutral";
  else if (hue < 15 || hue >= 345) family = "red";
  else if (hue < 45) family = "orange";
  else if (hue < 70) family = "yellow";
  else if (hue < 165) family = "green";
  else if (hue < 200) family = "cyan";
  else if (hue < 255) family = "blue";
  else if (hue < 300) family = "purple";
  else family = "pink";
  const temperature: Exclude<Temperature, "any"> = family === "neutral" ? "neutral"
    : ["red", "orange", "yellow", "pink"].includes(family) ? "warm" : "cool";
  return { hue, saturation: saturation * 100, lightness: lightness * 100, family, temperature };
}

export function hexStats(hex: string): ColorStats {
  return statsFromRgb(Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16));
}

export function matchRgb(r: number, g: number, b: number, filters: ExploreFilters): boolean {
  const c = statsFromRgb(r, g, b);
  return (filters.family === "all" || c.family === filters.family) &&
    (filters.temperature === "any" || c.temperature === filters.temperature) &&
    c.lightness >= filters.minLightness && c.lightness <= filters.maxLightness &&
    c.saturation >= filters.minSaturation && c.saturation <= filters.maxSaturation;
}
export function matchHex(hex: string, filters: ExploreFilters): boolean {
  return matchRgb(parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16),filters);
}
export function hasExploreFilters(filters: ExploreFilters): boolean {
  return Object.keys(DEFAULT_FILTERS).some(key => filters[key as keyof ExploreFilters] !== DEFAULT_FILTERS[key as keyof ExploreFilters]);
}

export function colorAt(index: number, order: RgbOrder): string {
  if (!Number.isInteger(index) || index < 0 || index >= RGB_TOTAL) throw new RangeError("Color index outside range");
  return order === "spectrum" ? rgbFromIndex(index) :
    "#" + (order === "hex" ? index : RGB_TOTAL - 1 - index).toString(16).padStart(6, "0");
}
export function colorIndex(hex: string, order: RgbOrder): number {
  if (order === "spectrum") {
    const channels = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
    let index = 0;
    for (let bit=0;bit<8;bit++) for (let c=0;c<3;c++)
      index |= ((channels[c] >> bit) & 1) << (3*bit+c);
    return index;
  }
  const raw = parseInt(hex.slice(1),16);
  return order === "hex" ? raw : RGB_TOTAL - raw - 1;
}
export function namedMatches(query: string, filters: ExploreFilters, order: "name" | "hue" | "lightness" | "saturation") {
  const q = query.trim().toLowerCase();
  const filtered = NAMED_COLORS.filter(([name,hex]) =>
    (!q || name.toLowerCase().includes(q) || hex.includes(q)) && matchHex(hex,filters));
  return [...filtered].sort((a,b) => {
    if (order === "name") return a[0].localeCompare(b[0]);
    return hexStats(a[1])[order === "hue" ? "hue" : order].valueOf() -
      hexStats(b[1])[order === "hue" ? "hue" : order].valueOf() || a[0].localeCompare(b[0]);
  }).map(([name,hex]) => ({name,hex}));
}

function luminance(hex: string): number {
  const channels = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255)
    .map(x => x <= 0.04045 ? x/12.92 : ((x+0.055)/1.055)**2.4);
  return channels[0]*0.2126 + channels[1]*0.7152 + channels[2]*0.0722;
}
export function pairContrast(a: string,b: string): number {
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}
