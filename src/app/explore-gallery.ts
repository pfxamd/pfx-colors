import { INITIAL_CSS_COLORS, type ColorRecord } from "./explore-catalog";
import { hexStats } from "./explore-model";

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

export function classifyGalleryColor(hex: string): ColorFamily {
  const { hue, saturation, lightness } = hexStats(hex);
  if (lightness >= 92 && saturation < 28) return "white";
  if (lightness <= 12 && saturation < 28) return "black";
  if (saturation < 12) return "gray";
  if (hue < 15 || hue >= 345) return "red";
  if (hue < 45) return "orange";
  if (hue < 70) return "yellow";
  if (hue < 165) return "green";
  if (hue < 255) return "blue";
  if (hue < 300) return "purple";
  return "pink";
}

/** A color can have several names across sources, but should only occupy one tile. */
export function uniqueGalleryColors(records: readonly ColorRecord[]): GalleryColor[] {
  const distinct = new Map<string, GalleryColor>();
  for (const [name, raw, origin] of records) {
    const hex = raw.toLowerCase();
    if (distinct.has(hex)) continue;
    const { hue, lightness, saturation } = hexStats(hex);
    distinct.set(hex, {
      name, hex, origin, family: classifyGalleryColor(hex),
      hue, lightness, saturation,
    });
  }
  return [...distinct.values()];
}

/** Browse all colors in a visually mixed sequence rather than alphabetic source order. */
export function arrangeGalleryColors(colors: readonly GalleryColor[], family: ColorFamily | null): GalleryColor[] {
  if (family !== null) {
    return colors.filter(color => color.family === family)
      .sort((a, b) => family === "white" || family === "black" || family === "gray"
        ? b.lightness - a.lightness || a.hue - b.hue
        : a.hue - b.hue || b.lightness - a.lightness);
  }
  const buckets = COLOR_FAMILIES.map(item =>
    colors.filter(color => color.family === item.id)
      .sort((a, b) => a.hue - b.hue || b.lightness - a.lightness));
  const mixed: GalleryColor[] = [];
  let position = 0;
  while (mixed.length < colors.length) {
    let added = false;
    for (const bucket of buckets) {
      if (position < bucket.length) {
        mixed.push(bucket[position]);
        added = true;
      }
    }
    if (!added) break;
    position++;
  }
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
