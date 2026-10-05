import { clamp } from "@pfx/interaction-core";
import { useDrag } from "@pfx/interaction-react";
import type { RefObject } from "react";
import { normalizePointWithinRect } from "./use-normalized-drag-surface";

export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
}

export function angleFromNormalizedPoint(
  point: NormalizedPoint,
  center: NormalizedPoint,
  width: number,
  height: number,
): number {
  const dx = (point.x - center.x) * width;
  const dy = (point.y - center.y) * height;
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

export function useNormalizedHandleDrag<
  THandle extends HTMLElement,
  TSurface extends HTMLElement,
>(
  handleRef: RefObject<THandle | null>,
  surfaceRef: RefObject<TSurface | null>,
  onChange: (point: NormalizedPoint) => void,
): void {
  useDrag(handleRef, {
    activationDistance: 1,
    touchAction: "none",
    preventDefault: true,
    cancelOnEscape: true,
    onChange(snapshot) {
      if (snapshot.phase !== "start" && snapshot.phase !== "update") return;
      const surface = surfaceRef.current;
      if (!surface) return;
      const point = normalizePointWithinRect(
        snapshot.position,
        surface.getBoundingClientRect(),
      );
      if (point) onChange(point);
    },
  });
}

export function useAngleHandleDrag<
  THandle extends HTMLElement,
  TSurface extends HTMLElement,
>(
  handleRef: RefObject<THandle | null>,
  surfaceRef: RefObject<TSurface | null>,
  center: NormalizedPoint,
  onChange: (angle: number) => void,
  reverse = false,
): void {
  useDrag(handleRef, {
    activationDistance: 1,
    touchAction: "none",
    preventDefault: true,
    cancelOnEscape: true,
    onChange(snapshot) {
      if (snapshot.phase !== "start" && snapshot.phase !== "update") return;

      const surface = surfaceRef.current;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      const point = normalizePointWithinRect(snapshot.position, rect);
      if (!point) return;

      const angle = angleFromNormalizedPoint(
        point,
        {
          x: clamp(center.x, 0, 1),
          y: clamp(center.y, 0, 1),
        },
        rect.width,
        rect.height,
      );
      onChange((angle + (reverse ? 180 : 0)) % 360);
    },
  });
}
