import { clamp, type InteractionSnapshot, type Point } from "@pfx/interaction-core";
import { useDrag, useKeyboardSensor } from "@pfx/interaction-react";
import type { RefObject } from "react";

interface RectLike {
  readonly left: number;
  readonly width: number;
}

export function normalizedXWithinRect(point: Point, rect: RectLike): number | null {
  if (rect.width <= 0) return null;
  return clamp((point.x - rect.left) / rect.width, 0, 1);
}

export interface HorizontalTrackDragOptions {
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly onChange: (value: number, snapshot?: InteractionSnapshot) => void;
}

export function useHorizontalTrackDrag<
  THandle extends HTMLElement,
  TTrack extends HTMLElement,
>(
  handleRef: RefObject<THandle | null>,
  trackRef: RefObject<TTrack | null>,
  options: HorizontalTrackDragOptions,
): void {
  const min = options.min ?? 0;
  const max = options.max ?? 1;
  const step = options.step ?? 0.01;

  const commit = (value: number, snapshot?: InteractionSnapshot) => {
    const snapped = Math.round(value / step) * step;
    options.onChange(clamp(snapped, min, max), snapshot);
  };

  useDrag(handleRef, {
    activationDistance: 1,
    touchAction: "none",
    preventDefault: true,
    cancelOnEscape: true,
    onChange(snapshot) {
      if (snapshot.phase !== "start" && snapshot.phase !== "update") return;

      const track = trackRef.current;
      if (!track) return;

      const normalized = normalizedXWithinRect(
        snapshot.position,
        track.getBoundingClientRect(),
      );
      if (normalized != null) commit(normalized, snapshot);
    },
  });

  useKeyboardSensor(handleRef, {
    preventDefault(event) {
      return (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "Home" ||
        event.key === "End"
      );
    },
    onSample(sample) {
      if (sample.phase !== "down") return;

      if (sample.key === "Home") {
        commit(min);
        return;
      }

      if (sample.key === "End") {
        commit(max);
        return;
      }

      const direction =
        sample.key === "ArrowRight" ? 1 : sample.key === "ArrowLeft" ? -1 : 0;
      if (direction === 0) return;

      const multiplier = sample.modifiers.shift ? 5 : 1;
      commit(options.value + direction * step * multiplier);
    },
  });
}
