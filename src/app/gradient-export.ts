import type { GradientDefinition } from "@pfx/color-core";

/** Portable source data; no browser object URLs or engine handles leak into exports. */
export function gradientExport(gradient: GradientDefinition): string {
  return JSON.stringify({
    type: gradient.type,
    angle: gradient.angle,
    center: { x: gradient.centerX, y: gradient.centerY },
    interpolation: gradient.interpolationSpace,
    stops: gradient.stops.map(stop => ({
      position: Number((stop.position * 100).toFixed(3)),
      hex: stop.hex.toUpperCase(),
      source: {
        space: stop.source.space,
        channels: stop.source.coordinates,
        alpha: stop.source.alpha,
      },
    })),
  }, null, 2);
}

export function gradientCssExport(gradientCss: string): string {
  return `:root {\n  --pfx-gradient: ${gradientCss};\n}\n\n.gradient {\n  background: var(--pfx-gradient);\n}\n`;
}

/** Remove floating-point conversion noise from portable CSS output. */
export function compactGradientCss(css: string): string {
  return css.replace(/\brgb\(([^)]*)\)/gi, (_whole, channels: string) =>
    "rgb(" + channels.replace(/-?\d+\.\d{4,}/g, value =>
      Number(Number(value).toFixed(3)).toString()) + ")");
}
