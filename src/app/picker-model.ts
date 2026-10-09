export function clampChannel(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
export function rgbFromHex(hex: string): [number, number, number] {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error("Expected six-digit HEX");
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
export function alphaHex(hex: string, alpha: number): string {
  const normalized = hex.toUpperCase();
  if (alpha >= 1) return normalized;
  return normalized + Math.round(clampChannel(alpha, 0, 1) * 255).toString(16).padStart(2, "0").toUpperCase();
}
const trim = (value: number, places: number) => Number(value.toFixed(places)).toString();
export function cssRgb(channels: readonly number[], alpha: number): string {
  const values = channels.map(value => Math.round(clampChannel(value, 0, 255)));
  return `rgb(${values.join(" ")}${alpha < 1 ? " / " + trim(alpha, 3) : ""})`;
}
export function cssHsl(hue: number, saturation: number, lightness: number, alpha: number): string {
  return `hsl(${trim(((hue % 360) + 360) % 360, 2)} ${trim(clampChannel(saturation, 0, 100), 2)}% ${trim(clampChannel(lightness, 0, 100), 2)}%${alpha < 1 ? " / " + trim(alpha, 3) : ""})`;
}
export function cssOklch(lightness: number, chroma: number, hue: number, alpha: number): string {
  return `oklch(${trim(clampChannel(lightness, 0, 1) * 100, 2)}% ${trim(Math.max(0, chroma), 4)} ${trim(hue, 2)}${alpha < 1 ? " / " + trim(alpha, 3) : ""})`;
}
/** This paints the visual HSL surface. Committed colors always use the pinned color core. */
export function hslRgbUnit(hue: number, saturation: number, lightness: number): [number, number, number] {
  const h = ((hue % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = lightness - c / 2;
  let channels: [number, number, number];
  if (h < 60) channels = [c, x, 0];
  else if (h < 120) channels = [x, c, 0];
  else if (h < 180) channels = [0, c, x];
  else if (h < 240) channels = [0, x, c];
  else if (h < 300) channels = [x, 0, c];
  else channels = [c, 0, x];
  return [channels[0] + m, channels[1] + m, channels[2] + m];
}
export function paintHslField(ctx: CanvasRenderingContext2D, hue: number): void {
  const { width, height } = ctx.canvas;
  if (width < 2 || height < 2) return;
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const lightness = 1 - y / (height - 1);
    for (let x = 0; x < width; x++) {
      const rgb = hslRgbUnit(hue, x / (width - 1), lightness);
      const offset = (y * width + x) * 4;
      image.data[offset] = Math.round(rgb[0] * 255);
      image.data[offset + 1] = Math.round(rgb[1] * 255);
      image.data[offset + 2] = Math.round(rgb[2] * 255);
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}
