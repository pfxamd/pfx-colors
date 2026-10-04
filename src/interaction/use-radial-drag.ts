import type { InteractionSnapshot, Point } from "@pfx/interaction-core";
import { useDrag } from "@pfx/interaction-react";
import type { RefObject } from "react";

interface RectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function angleFromPoint(point: Point, rect: RectLike): number | null {
  if (rect.width <= 0 || rect.height <= 0) return null;

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const radians = Math.atan2(point.y - centerY, point.x - centerX);
  const degrees = (radians * 180) / Math.PI + 90;

  return ((degrees % 360) + 360) % 360;
}

export function useRadialDrag<THandle extends HTMLElement, TSurface extends HTMLElement>(
  handleRef: RefObject<THandle | null>,
  surfaceRef: RefObject<TSurface | null>,
  onChange: (angle: number, snapshot: InteractionSnapshot) => void,
): void {
  useDrag(handleRef, {
    activationDistance: 2,
    touchAction: "none",
    preventDefault: true,
    cancelOnEscape: true,
    onChange(snapshot) {
      if (snapshot.phase !== "start" && snapshot.phase !== "update") return;

      const surface = surfaceRef.current;
      if (!surface) return;

      const angle = angleFromPoint(
        snapshot.position,
        surface.getBoundingClientRect(),
      );
      if (angle != null) onChange(angle, snapshot);
    },
  });
}
