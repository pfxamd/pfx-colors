/**
 * Subpixel integration for the angular singularity of a conic gradient.
 *
 * One point sample at the gradient center is arbitrary: arbitrarily small
 * changes in position can select a completely different angle. Average
 * samples over the *pixel's actual area* instead of adding a radial blur.
 * Blend in premultiplied linear-light sRGB so transparency cannot cause
 * dark fringes. Only a few pixels around the singularity need refinement.
 */
export type PixelColor = { readonly channels: readonly number[]; readonly alpha: number };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const decode = (value: number) => {
  const c = clamp01(value);
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const encode = (value: number) => {
  const c = clamp01(value);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};

export function refineConicCenter(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  sample: (x: number, y: number) => PixelColor,
): void {
  if (pixels.length !== width * height * 4 || !Number.isFinite(centerX) ||
    !Number.isFinite(centerY)) return;

  // Fixed spatial budget, independent of preview/export dimensions. The
  // ordinary per-pixel renderer remains unchanged outside this small disk.
  const radius = 5;
  const left = Math.max(0, Math.floor(centerX - radius));
  const right = Math.min(width - 1, Math.ceil(centerX + radius));
  const top = Math.max(0, Math.floor(centerY - radius));
  const bottom = Math.min(height - 1, Math.ceil(centerY + radius));
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      if (distance > radius) continue;
      // Extra sampling precisely where a single angular sample is least
      // representative. Beyond 2 pixels, 2x2 coverage is sufficient.
      const axis = distance <= 2 ? 3 : 2;
      const samples = axis * axis;
      let alpha = 0;
      const linear = [0, 0, 0];
      for (let sy = 0; sy < axis; sy++) {
        for (let sx = 0; sx < axis; sx++) {
          const color = sample(x + (sx + 0.5) / axis, y + (sy + 0.5) / axis);
          const a = clamp01(color.alpha);
          alpha += a;
          for (let channel = 0; channel < 3; channel++) {
            linear[channel] += decode(color.channels[channel] ?? 0) * a;
          }
        }
      }
      const offset = (y * width + x) * 4;
      pixels[offset + 3] = Math.round(255 * alpha / samples);
      for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] = Math.round(
          255 * encode(alpha > 0 ? linear[channel] / alpha : 0),
        );
      }
    }
  }
}
