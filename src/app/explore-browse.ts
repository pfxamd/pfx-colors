import { gamutMappedHex, oklchToRgb, rgbToHex } from "./explore-atlas";

export type BrowseCell = { hex: string; lightness: number; chroma: number; row: number; column: number };
export const BROWSE_LIGHTNESS = [0.92, 0.83, 0.74, 0.65, 0.56, 0.47, 0.38, 0.29] as const;
export const BROWSE_COLUMNS = 12;

/** Smooth, perceptual samples at a fixed hue. No catalog or huge RGB list. */
export function browseCells(hue: number, neutral = false): BrowseCell[] {
  const cells: BrowseCell[] = [];
  for (let row = 0; row < BROWSE_LIGHTNESS.length; row++) {
    const l = BROWSE_LIGHTNESS[row];
    // Find the actual sRGB chroma boundary at each lightness; prevents artificial gray clipping.
    let low = 0, high = 0.4;
    if (!neutral) {
      for (let i = 0; i < 20; i++) {
        const mid = (low + high) / 2;
        if (oklchToRgb({ l, c: mid, h: hue })) low = mid;
        else high = mid;
      }
    }
    for (let column = 0; column < BROWSE_COLUMNS; column++) {
      const c = neutral ? 0 : low * (0.025 + (column / (BROWSE_COLUMNS - 1)) * 0.94);
      const rgb = oklchToRgb({ l, c, h: hue });
      const hex = rgb ? rgbToHex(rgb) : gamutMappedHex({ l, c, h: hue });
      cells.push({ hex, lightness: l, chroma: c, row, column });
    }
  }
  // Grayscale needs a distinct single column, not twelve repeats.
  return neutral ? cells.filter(cell => cell.column === 0) : cells;
}
