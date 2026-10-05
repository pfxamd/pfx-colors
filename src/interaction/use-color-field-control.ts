import { clamp, type Point } from "@pfx/interaction-core";
import { useDrag, useKeyboardSensor } from "@pfx/interaction-react";
import type { RefObject } from "react";
import { normalizePointWithinRect } from "./use-normalized-drag-surface";

export interface ColorFieldPoint {
  readonly x: number;
  readonly y: number;
}

export interface ColorFieldControlOptions {
  readonly value: ColorFieldPoint;
  readonly onChange: (point: ColorFieldPoint) => void;
  readonly onActiveChange?: (active: boolean) => void;
  readonly keyboardStep?: number;
  readonly precisionScale?: number;
}

export function applyPrecisionDelta(
  value: ColorFieldPoint,
  delta: Point,
  width: number,
  height: number,
  precisionScale: number,
): ColorFieldPoint {
  if (width <= 0 || height <= 0) return value;

  return {
    x: clamp(value.x + (delta.x / width) * precisionScale, 0, 1),
    y: clamp(value.y + (delta.y / height) * precisionScale, 0, 1),
  };
}

export function useColorFieldControl<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: ColorFieldControlOptions,
): void {
  const valueRef = { current: options.value };
  const keyboardStep = options.keyboardStep ?? 0.01;
  const precisionScale = options.precisionScale ?? 0.18;

  valueRef.current = options.value;

  const commit = (next: ColorFieldPoint) => {
    valueRef.current = next;
    options.onChange(next);
  };

  useDrag(ref, {
    activationDistance: 0,
    touchAction: "none",
    preventDefault: true,
    cancelOnEscape: true,
    onChange(snapshot) {
      if (snapshot.phase === "end" || snapshot.phase === "cancel") {
        options.onActiveChange?.(false);
        return;
      }

      if (snapshot.phase !== "start" && snapshot.phase !== "update") return;

      const element = ref.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const absolute = normalizePointWithinRect(snapshot.position, rect);
      if (!absolute) return;

      options.onActiveChange?.(true);

      if (snapshot.phase === "update" && snapshot.modifiers.shift) {
        commit(
          applyPrecisionDelta(
            valueRef.current,
            snapshot.delta,
            rect.width,
            rect.height,
            precisionScale,
          ),
        );
        return;
      }

      commit(absolute);
    },
  });

  useKeyboardSensor(ref, {
    preventDefault(event) {
      return (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown"
      );
    },
    onSample(sample) {
      if (sample.phase !== "down") return;

      let x = 0;
      let y = 0;
      if (sample.key === "ArrowLeft") x = -1;
      if (sample.key === "ArrowRight") x = 1;
      if (sample.key === "ArrowUp") y = -1;
      if (sample.key === "ArrowDown") y = 1;
      if (x === 0 && y === 0) return;

      const step = sample.modifiers.shift ? keyboardStep * 0.2 : keyboardStep;
      options.onActiveChange?.(true);
      commit({
        x: clamp(valueRef.current.x + x * step, 0, 1),
        y: clamp(valueRef.current.y + y * step, 0, 1),
      });
    },
  });
}
