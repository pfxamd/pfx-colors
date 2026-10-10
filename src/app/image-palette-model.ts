export type ImagePaletteColor = { hex: string; pixels: number };
type PixelSource = { data: Uint8ClampedArray; width: number; height: number };

const hex = (r: number, g: number, b: number): string =>
  "#" + [r, g, b].map(value => Math.max(0, Math.min(255, Math.round(value)))
    .toString(16).padStart(2, "0")).join("");

export function extractPaletteFromPixels(source: PixelSource, requested: number): ImagePaletteColor[] {
  if (!Number.isInteger(requested) || requested < 2 || requested > 12)
    throw new RangeError("Palette size must be between 2 and 12");
  const { data, width, height } = source;
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return [];
  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  const sampleStep = Math.max(1, Math.floor(width * height / 100_000));
  for (let pixel = 0; pixel < width * height; pixel += sampleStep) {
    const offset = pixel * 4;
    const alpha = data[offset + 3] / 255;
    if (alpha < 0.5) continue;
    // Semi-transparent pixels are composited on white for a predictable browser preview.
    const r = Math.round(data[offset] * alpha + 255 * (1 - alpha));
    const g = Math.round(data[offset + 1] * alpha + 255 * (1 - alpha));
    const b = Math.round(data[offset + 2] * alpha + 255 * (1 - alpha));
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const item = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    item.count++;
    item.r += r; item.g += g; item.b += b;
    bins.set(key, item);
  }
  const candidates = [...bins.values()].map(item => ({
    pixels: item.count,
    rgb: [item.r / item.count, item.g / item.count, item.b / item.count] as const,
  })).sort((a,b) => b.pixels - a.pixels).slice(0, Math.max(150, requested * 30));
  if (!candidates.length) return [];
  const selected: typeof candidates = [candidates[0]];
  const distance = (a: (typeof candidates)[number], b: (typeof candidates)[number]) =>
    Math.sqrt(a.rgb.reduce((sum, value, i) => sum + (value - b.rgb[i]) ** 2, 0));
  while (selected.length < requested) {
    const remaining = candidates.filter(candidate =>
      !selected.includes(candidate) && selected.every(current => distance(candidate, current) >= 27));
    if (!remaining.length) break;
    const next = remaining.map(candidate => ({
      candidate,
      score: Math.sqrt(candidate.pixels) *
        Math.pow(Math.min(...selected.map(current => distance(candidate, current))), 1.25),
    })).sort((a,b) => b.score - a.score)[0];
    selected.push(next.candidate);
  }
  return selected.map(item => ({
    hex: hex(item.rgb[0], item.rgb[1], item.rgb[2]),
    pixels: item.pixels,
  }));
}
