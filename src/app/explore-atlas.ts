export type Rgb = readonly [number, number, number];
export type Oklch = { l: number; c: number; h: number };
export type AtlasTile = { depth: 2 | 4 | 6 | 8; r: number; g: number; b: number };
export const TOTAL_RGB = 16_777_216;
export const MAX_CHROMA = 0.4;
export const FAMILIES = [
  { label: "Red", hue: 28 }, { label: "Orange", hue: 55 },
  { label: "Yellow", hue: 100 }, { label: "Green", hue: 150 },
  { label: "Cyan", hue: 205 }, { label: "Blue", hue: 260 },
  { label: "Purple", hue: 310 }, { label: "Pink", hue: 355 },
] as const;

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const linearize = (value: number) => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const encode = (value: number) => value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;

export function rgbToHex(rgb: Rgb): string {
  return "#" + rgb.map(x => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, "0")).join("");
}
export function hexToRgb(hex: string): Rgb {
  const code = hex.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(code)) throw new RangeError("Expected 6-digit HEX");
  return [parseInt(code.slice(0, 2), 16), parseInt(code.slice(2, 4), 16), parseInt(code.slice(4, 6), 16)];
}

// Ottosson Oklab: linear sRGB -> LMS cube root -> perceptual coordinates.
export function rgbToOklch(rgb: Rgb): Oklch {
  const [r, g, b] = rgb.map(linearize);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: clamp(L), c: Math.hypot(a, bb), h: (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360 };
}

// Gamut handling is explicit: return null for colors sRGB cannot represent.
export function oklchToRgb({ l, c, h }: Oklch): Rgb | null {
  if (!Number.isFinite(l) || !Number.isFinite(c) || !Number.isFinite(h) || l < 0 || l > 1 || c < 0) return null;
  const rad = h * Math.PI / 180;
  const a = c * Math.cos(rad), b = c * Math.sin(rad);
  const l0 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m0 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s0 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l0 - 3.3077115913 * m0 + 0.2309699292 * s0,
    -1.2684380046 * l0 + 2.6097574011 * m0 - 0.3413193965 * s0,
    -0.0041960863 * l0 - 0.7034186147 * m0 + 1.707614701 * s0,
  ];
  if (linear.some(x => x < -0.000001 || x > 1.000001)) return null;
  return linear.map(x => Math.round(clamp(encode(clamp(x))) * 255)) as unknown as Rgb;
}
export function gamutMappedHex(input: Oklch): string {
  const exact = oklchToRgb(input);
  if (exact) return rgbToHex(exact);
  let low = 0, high = Math.max(0, input.c);
  for (let i = 0; i < 19; i++) {
    const mid = (low + high) / 2;
    if (oklchToRgb({ ...input, c: mid })) low = mid;
    else high = mid;
  }
  return rgbToHex(oklchToRgb({ ...input, c: low }) ?? [Math.round(input.l * 255), Math.round(input.l * 255), Math.round(input.l * 255)]);
}

// Each drill-down consumes two bits per channel, branching 64 ways.
// Four levels (2,4,6,8 bits/channel) cover every 24-bit sRGB code once.
export function atlasChildren(parent: AtlasTile | null): AtlasTile[] {
  if (parent?.depth === 8) return [];
  const depth = (parent ? parent.depth + 2 : 2) as AtlasTile["depth"];
  const base = parent ? { r: parent.r * 4, g: parent.g * 4, b: parent.b * 4 } : { r: 0, g: 0, b: 0 };
  const tiles: AtlasTile[] = [];
  for (let r = 0; r < 4; r++) for (let g = 0; g < 4; g++) for (let b = 0; b < 4; b++)
    tiles.push({ depth, r: base.r + r, g: base.g + g, b: base.b + b });
  return tiles;
}
export function tileRepresentative(tile: AtlasTile): Rgb {
  const size = 1 << (8 - tile.depth);
  const middle = Math.floor((size - 1) / 2);
  return [(tile.r * size) + middle, (tile.g * size) + middle, (tile.b * size) + middle];
}
export function tileRange(tile: AtlasTile): { min: string; max: string } {
  const size = 1 << (8 - tile.depth);
  return {
    min: rgbToHex([tile.r * size, tile.g * size, tile.b * size]),
    max: rgbToHex([(tile.r + 1) * size - 1, (tile.g + 1) * size - 1, (tile.b + 1) * size - 1]),
  };
}
export function tileCount(tile: AtlasTile): number { return 2 ** (3 * (8 - tile.depth)); }
export function atlasPath(hex: string): AtlasTile[] {
  const [r, g, b] = hexToRgb(hex);
  return ([2, 4, 6, 8] as const).map(depth => ({
    depth, r: r >> (8 - depth), g: g >> (8 - depth), b: b >> (8 - depth),
  }));
}
export function tileHasHex(tile: AtlasTile, hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return tile.r === r >> (8 - tile.depth) && tile.g === g >> (8 - tile.depth) && tile.b === b >> (8 - tile.depth);
}
export function perceptualDistance(a: string, b: string): number {
  const x = rgbToOklch(hexToRgb(a)), y = rgbToOklch(hexToRgb(b));
  const ax = x.c * Math.cos(x.h * Math.PI / 180), bx = y.c * Math.cos(y.h * Math.PI / 180);
  const ay = x.c * Math.sin(x.h * Math.PI / 180), by = y.c * Math.sin(y.h * Math.PI / 180);
  return Math.hypot(x.l - y.l, ax - bx, ay - by);
}
export function relatedShades(hex: string): string[] {
  const o = rgbToOklch(hexToRgb(hex));
  const options: string[] = [];
  for (const deltaL of [-0.18, -0.12, -0.06, 0, 0.06, 0.12, 0.18])
    for (const deltaH of [-20, -10, 0, 10, 20]) {
      const l = clamp(o.l + deltaL, 0.02, 0.98);
      const h = (o.h + deltaH + 360) % 360;
      options.push(gamutMappedHex({ l, h, c: o.c }));
    }
  return [...new Set(options)].filter(candidate => candidate !== hex).sort(
    (a, b) => perceptualDistance(a, hex) - perceptualDistance(b, hex)
  ).slice(0, 16);
}
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = hexToRgb(hex).map(linearize);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
