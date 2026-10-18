import { INITIAL_CSS_COLORS, type ColorRecord } from "./explore-catalog";
import { hexStats } from "./explore-model";
import { hexToRgb, rgbToOklch } from "./explore-atlas";

export type ColorFamily = "white" | "black" | "gray" | "red" | "orange" |
  "yellow" | "green" | "blue" | "purple" | "pink";

export type GalleryColor = {
  name: string;
  hex: string;
  origin: string;
  family: ColorFamily;
  hue: number;
  lightness: number;
  saturation: number;
  chroma: number;
  perceptualLightness: number;
};

export const COLOR_FAMILIES: readonly { id: ColorFamily; name: string; swatch: string }[] = [
  { id: "white", name: "White", swatch: "#ffffff" },
  { id: "black", name: "Black", swatch: "#17191e" },
  { id: "gray", name: "Gray", swatch: "#92979c" },
  { id: "red", name: "Red", swatch: "#e84d57" },
  { id: "orange", name: "Orange", swatch: "#f18b42" },
  { id: "yellow", name: "Yellow", swatch: "#eec84c" },
  { id: "green", name: "Green", swatch: "#61b986" },
  { id: "blue", name: "Blue", swatch: "#548bd8" },
  { id: "purple", name: "Purple", swatch: "#9a70cb" },
  { id: "pink", name: "Pink", swatch: "#e188b1" },
];

/**
 * HSL hue alone is misleading near white: #FFF5F5 has a red hue despite
 * looking white. Gate hue classification by perceptual OKLCH chroma first.
 */
function familyForAppearance(hue: number, chroma: number, lightness: number): ColorFamily {
  if (lightness >= 0.89 && chroma < 0.065) return "white";
  if (lightness <= 0.27 && chroma < 0.055) return "black";
  if (chroma < 0.055) return "gray";
  if (hue < 18 || hue >= 346) return "red";
  if (hue < 45) return "orange";
  if (hue < 70) return "yellow";
  if (hue < 165) return "green";
  if (hue < 255) return "blue";
  if (hue < 300) return "purple";
  return "pink";
}

export function classifyGalleryColor(hex: string): ColorFamily {
  const { hue } = hexStats(hex);
  const { c, l } = rgbToOklch(hexToRgb(hex));
  return familyForAppearance(hue, c, l);
}

/** One tile per existing HEX value, keeping the original library color. */
export function uniqueGalleryColors(records: readonly ColorRecord[]): GalleryColor[] {
  const distinct = new Map<string, GalleryColor>();
  for (const [name, raw, origin] of records) {
    const hex = raw.toLowerCase();
    if (distinct.has(hex)) continue;
    const { hue, lightness, saturation } = hexStats(hex);
    const { c, l } = rgbToOklch(hexToRgb(hex));
    distinct.set(hex, {
      name, hex, origin, family: familyForAppearance(hue, c, l),
      hue, lightness, saturation, chroma: c, perceptualLightness: l,
    });
  }
  return [...distinct.values()];
}

/**
 * Colored families start with clearly recognizable, vivid colors, but mix
 * light/medium/dark tones. No near-white first page and no generated shades.
 */
function sortFamily(colors: readonly GalleryColor[], family: ColorFamily): GalleryColor[] {
  if (family === "white") return [...colors].sort((a, b) =>
    b.perceptualLightness - a.perceptualLightness || a.chroma - b.chroma);
  if (family === "black") return [...colors].sort((a, b) =>
    a.perceptualLightness - b.perceptualLightness || a.chroma - b.chroma);
  if (family === "gray") return [...colors].sort((a, b) =>
    Math.abs(a.perceptualLightness - 0.52) - Math.abs(b.perceptualLightness - 0.52) ||
    b.perceptualLightness - a.perceptualLightness);

  const bands: GalleryColor[][] = [[], [], [], [], []];
  for (const color of colors) {
    const lightness = color.perceptualLightness;
    const index = lightness < 0.35 ? 0 : lightness < 0.51 ? 1 :
      lightness < 0.69 ? 2 : lightness < 0.84 ? 3 : 4;
    bands[index].push(color);
  }
  for (const band of bands) band.sort((a, b) =>
    b.chroma - a.chroma ||
    Math.abs(a.perceptualLightness - 0.62) - Math.abs(b.perceptualLightness - 0.62));

  // The most legible medium tones lead; darker and lighter tones alternate.
  const priority = [2, 1, 3, 0, 4];
  const result: GalleryColor[] = [];
  const longest = Math.max(...bands.map(band => band.length));
  for (let index = 0; index < longest; index++)
    for (const group of priority)
      if (index < bands[group].length) result.push(bands[group][index]);
  return result;
}

/** Show all unique existing colors while keeping the initial rows varied. */
export function arrangeGalleryColors(colors: readonly GalleryColor[], family: ColorFamily | null): GalleryColor[] {
  if (family !== null) return sortFamily(colors.filter(color => color.family === family), family);
  const buckets = COLOR_FAMILIES.map(item =>
    sortFamily(colors.filter(color => color.family === item.id), item.id));
  const mixed: GalleryColor[] = [];
  const longest = Math.max(...buckets.map(bucket => bucket.length));
  for (let position = 0; position < longest; position++)
    for (const bucket of buckets)
      if (position < bucket.length) mixed.push(bucket[position]);
  return mixed;
}

export type GalleryPalette = {
  id: string;
  title: string;
  mood: "Calm" | "Warm" | "Nature" | "Soft" | "Bold" | "Dark" | "Earth";
  colors: readonly string[];
};

const names = new Map(INITIAL_CSS_COLORS.map(([name, hex]) => [name.toLowerCase(), hex.toLowerCase()]));

/** Original PFx groupings made from colors that already belong to the CSS named library. */
const recipes: readonly [string, GalleryPalette["mood"], readonly string[]][] = [
  ["Coastal Morning", "Calm", ["Midnight Blue", "Cadet Blue", "Light Sea Green", "Powder Blue", "Alice Blue"]],
  ["Golden Hour", "Warm", ["Fire Brick", "Tomato", "Sandy Brown", "Gold", "Papaya Whip"]],
  ["Olive Grove", "Earth", ["Dark Green", "Olive", "Dark Khaki", "Wheat", "Floral White"]],
  ["Rosewater", "Soft", ["Pale Violet Red", "Light Pink", "Misty Rose", "Lavender Blush", "Snow"]],
  ["Quiet Studio", "Soft", ["Slate Gray", "Light Steel Blue", "Lavender", "Gainsboro", "White Smoke"]],
  ["Terracotta", "Earth", ["Saddle Brown", "Sienna", "Peru", "Tan", "Antique White"]],
  ["Midnight Garden", "Dark", ["Black", "Dark Slate Blue", "Medium Purple", "Deep Pink", "Lavender"]],
  ["Orchard Light", "Nature", ["Dark Olive Green", "Olive Drab", "Yellow Green", "Khaki", "Ivory"]],
  ["Cool Current", "Calm", ["Dark Slate Gray", "Teal", "Medium Aqua Marine", "Turquoise", "Azure"]],
  ["Citrus Afternoon", "Warm", ["Chocolate", "Coral", "Dark Orange", "Gold", "Lemon Chiffon"]],
  ["Ink & Lavender", "Dark", ["Midnight Blue", "Dark Slate Blue", "Blue Violet", "Thistle", "Ghost White"]],
  ["Coral Dusk", "Warm", ["Maroon", "Indian Red", "Light Coral", "Peach Puff", "Seashell"]],
  ["Botanical", "Nature", ["Dark Green", "Forest Green", "Medium Sea Green", "Pale Green", "Honey Dew"]],
  ["Blue Note", "Calm", ["Navy", "Royal Blue", "Cornflower Blue", "Light Blue", "Alice Blue"]],
  ["Plum & Honey", "Bold", ["Indigo", "Dark Magenta", "Medium Orchid", "Golden Rod", "Corn Silk"]],
  ["Summer Paper", "Soft", ["Salmon", "Light Salmon", "Peach Puff", "Lemon Chiffon", "Ivory"]],
  ["Sea Glass", "Calm", ["Dark Cyan", "Light Sea Green", "Medium Turquoise", "Pale Turquoise", "Mint Cream"]],
  ["Wildflower", "Nature", ["Dark Olive Green", "Olive Drab", "Medium Sea Green", "Orchid", "Lavender"]],
  ["Festival", "Bold", ["Dark Violet", "Deep Pink", "Orange Red", "Gold", "Spring Green"]],
  ["Monochrome", "Dark", ["Black", "Dim Gray", "Dark Gray", "Gainsboro", "White Smoke"]],
];

export const GALLERY_PALETTES: readonly GalleryPalette[] = recipes.map(([title, mood, shades], index) => ({
  id: "pfx-" + index,
  title, mood,
  colors: shades.map(name => names.get(name.toLowerCase())).filter((value): value is string => Boolean(value)),
})).filter(palette => palette.colors.length === 5);
