import type { ColorInput, GradientDefinition, GradientStopInput, GradientType } from "@pfx/color-core";

export const GRADIENT_DRAFT_KEY = "pfx-colors.gradient.draft.v2";
export type SavedGradientDraft = {
  stops: GradientStopInput[];
  type: GradientType;
  angle: number;
  centerX: number;
  centerY: number;
  interpolationSpace: string;
};
export function saveGradientDraft(gradient: GradientDefinition): void {
  try {
    const data: SavedGradientDraft = {
      type: gradient.type, angle: gradient.angle,
      centerX: gradient.centerX, centerY: gradient.centerY,
      interpolationSpace: gradient.interpolationSpace,
      stops: gradient.stops.map(stop => ({
        position: stop.position,
        color: { space: stop.source.space,
          coordinates: [...stop.source.coordinates], alpha: stop.source.alpha },
      })),
    };
    window.localStorage.setItem(GRADIENT_DRAFT_KEY, JSON.stringify(data));
  } catch { /* Storage may be unavailable. */ }
}
const finite = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
export function readGradientDraft(storage: Pick<Storage, "getItem"> | null): SavedGradientDraft | null {
  try {
    const raw = storage?.getItem(GRADIENT_DRAFT_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const data = value as Record<string, unknown>;
    if (!["linear", "radial", "conic"].includes(data.type as string) ||
        !["oklch", "oklab", "srgb"].includes(data.interpolationSpace as string) ||
        !finite(data.angle, 0, 360) ||
        !finite(data.centerX, 0, 1) || !finite(data.centerY, 0, 1) ||
        !Array.isArray(data.stops) || data.stops.length < 2 || data.stops.length > 16) return null;
    const stops: GradientStopInput[] = [];
    for (const stop of data.stops as unknown[]) {
      if (!stop || typeof stop !== "object") return null;
      const item = stop as { position?: unknown; color?: unknown };
      if (!finite(item.position, 0, 1) || !item.color || typeof item.color !== "object") return null;
      const color = item.color as { space?: unknown; coordinates?: unknown; alpha?: unknown };
      if (typeof color.space !== "string" || !/^[a-z0-9-]{2,20}$/.test(color.space) ||
          !Array.isArray(color.coordinates) || color.coordinates.length < 3 ||
          color.coordinates.length > 4 || !color.coordinates.every(v => finite(v, -1000, 1000)) ||
          !finite(color.alpha, 0, 1)) return null;
      stops.push({ position: item.position, color: color as ColorInput });
    }
    return {
      type: data.type as GradientType, angle: data.angle,
      centerX: data.centerX, centerY: data.centerY,
      interpolationSpace: data.interpolationSpace as string,
      stops,
    };
  } catch { return null; }
}
