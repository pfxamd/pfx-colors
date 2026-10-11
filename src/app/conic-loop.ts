import type { ColorInput, GradientDefinition, GradientStopInput } from "@pfx/color-core";
import { createGradient } from "../rust/operations";

/**
 * Conic gradients are periodic, but distinct colors at 0 and 360 degrees
 * create a real CSS seam. Leave a visible closing arc for the last editable
 * color to transition back to the first; don't conceal a hard stop with blur.
 *
 * Editor positions are the actual CSS positions. The extra closing stop at
 * 100% is render-only and does not count as an editable color.
 */
export function conicEditableLimit(count: number): number {
  return 1 - Math.max(0.1, 1 / Math.max(count, 2));
}

export function prepareConicStops(
  stops: readonly GradientStopInput[],
): GradientStopInput[] {
  if (stops.length < 2) return [...stops];
  const end = Math.max(...stops.map(stop => stop.position));
  const limit = conicEditableLimit(stops.length);
  if (end <= limit) return [...stops];
  // Preserve relative angles, and guarantee enough room for the return ramp.
  const scale = limit / end;
  return stops.map(stop => ({
    color: stop.color,
    position: stop.position * scale,
  }));
}

const asInput = (source: GradientDefinition["stops"][number]["source"]): ColorInput => ({
  space: source.space,
  coordinates: source.coordinates.map(value => value ?? 0),
  alpha: source.alpha,
});

/** One definition drives the Rust raster, browser CSS and sampled preview. */
export function closeConicGradient(gradient: GradientDefinition): GradientDefinition {
  if (gradient.type !== "conic") return gradient;
  const stops = prepareConicStops(gradient.stops.map(stop => ({
    color: asInput(stop.source),
    position: stop.position,
  })));
  return createGradient(
    [...stops, { color: stops[0].color, position: 1 }],
    {
      type: "conic",
      angle: gradient.angle,
      centerX: gradient.centerX,
      centerY: gradient.centerY,
      interpolationSpace: gradient.interpolationSpace,
      targetSpace: gradient.targetSpace,
      hue: gradient.hue,
    },
  );
}
