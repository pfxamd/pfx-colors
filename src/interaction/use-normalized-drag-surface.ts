import { clamp, type Point } from "@pfx/interaction-core";
import { useDrag } from "@pfx/interaction-react";
import type { RefObject } from "react";

export interface NormalizedInteractionPoint {
  readonly x: number;
  readonly y: number;
}

interface RectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function normalizePointWithinRect(
  point: Point,
  rect: RectLike,
): NormalizedInteractionPoint | null {
  if (rect.width <= 0 || rect.height <= 0) return null;

  return {
    x: clamp((point.x - rect.left) / rect.width, 0, 1),
    y: clamp((point.y - rect.top) / rect.height, 0, 1),
  };
}

export function useNormalizedDragSurface<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onChange: (point: NormalizedInteractionPoint) => void,
): void {
  useDrag(ref, {
    activationDistance: 0,
    touchAction: "none",
    preventDefault: true,
    cancelOnEscape: true,
    onChange(snapshot) {
      if (snapshot.phase !== "start" && snapshot.phase !== "update") return;

      const element = ref.current;
      if (!element) return;

      const normalized = normalizePointWithinRect(
        snapshot.position,
        element.getBoundingClientRect(),
      );
      if (normalized) onChange(normalized);
    },
  });
}
