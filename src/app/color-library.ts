export const RGB_TOTAL = 0x1000000;
export const RGB_PAGE_SIZE = 48;

/**
 * Morton/Z-order enumerator. Every 24-bit sRGB color appears exactly once;
 * neighbors are clustered by channel rather than the unusable numeric HEX order.
 */
export function rgbFromIndex(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= RGB_TOTAL)
    throw new RangeError("RGB index out of range");
  let r = 0, g = 0, b = 0;
  for (let bit = 0; bit < 8; bit++) {
    r |= ((index >>> (3 * bit)) & 1) << bit;
    g |= ((index >>> (3 * bit + 1)) & 1) << bit;
    b |= ((index >>> (3 * bit + 2)) & 1) << bit;
  }
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

export function indexFromRgb(hex: string): number | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const channels = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
  let index = 0;
  for (let bit = 0; bit < 8; bit++) {
    channels.forEach((channel, channelIndex) => {
      index |= ((channel >>> bit) & 1) << (3 * bit + channelIndex);
    });
  }
  return index;
}

export function rgbPage(page: number): string[] {
  if (!Number.isInteger(page) || page < 0 || page > Math.floor((RGB_TOTAL - 1) / RGB_PAGE_SIZE))
    throw new RangeError("RGB page out of range");
  return Array.from({ length: Math.min(RGB_PAGE_SIZE, RGB_TOTAL - page * RGB_PAGE_SIZE) },
    (_, i) => rgbFromIndex(page * RGB_PAGE_SIZE + i));
}

export const NAMED_COLORS = [
  ["Tomato", "#ff6347"], ["Royal Blue", "#4169e1"], ["Sea Green", "#2e8b57"],
  ["Light Coral", "#f08080"], ["Slate Gray", "#708090"], ["Gold", "#ffd700"],
  ["Rebecca Purple", "#663399"], ["Salmon", "#fa8072"], ["Cornflower Blue", "#6495ed"],
  ["Dark Orchid", "#9932cc"], ["Medium Aquamarine", "#66cdaa"], ["Deep Sky Blue", "#00bfff"],
  ["Indian Red", "#cd5c5c"], ["Dark Turquoise", "#00ced1"], ["Lavender", "#e6e6fa"],
  ["Indigo", "#4b0082"], ["Sandy Brown", "#f4a460"], ["Olive Drab", "#6b8e23"],
  ["Crimson", "#dc143c"], ["Steel Blue", "#4682b4"], ["Dark Slate Blue", "#483d8b"],
  ["Rosy Brown", "#bc8f8f"], ["Medium Violet Red", "#c71585"], ["Teal", "#008080"]
] as const;

export function normalizeHex(value: string): string | null {
  const trimmed = value.trim();
  if (/^#?[0-9a-f]{6}$/i.test(trimmed)) return ("#" + trimmed.replace(/^#/, "")).toLowerCase();
  if (/^#?[0-9a-f]{3}$/i.test(trimmed)) {
    const chars = trimmed.replace(/^#/, "").toLowerCase();
    return "#" + [...chars].map(char => char + char).join("");
  }
  return null;
}
