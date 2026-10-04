import { clamp, denormalize, stepValue } from "@pfx/interaction-core";
import { useKeyboardSensor } from "@pfx/interaction-react";
import type { RefObject } from "react";
import { useRadialDrag } from "./use-radial-drag";

export interface ScalarDialOptions {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly onChange: (value: number) => void;
}

export function scalarValueFromAngle(
  angle: number,
  min: number,
  max: number,
  step = 1,
): number {
  const normalized = clamp(angle / 360, 0, 1);
  const raw = denormalize(normalized, min, max);
  return clamp(stepValue(raw, step, min), min, max);
}

export function useScalarDial<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: ScalarDialOptions,
): void {
  const step = options.step ?? 1;

  useRadialDrag(ref, ref, (angle) => {
    options.onChange(
      scalarValueFromAngle(angle, options.min, options.max, step),
    );
  });

  useKeyboardSensor(ref, {
    preventDefault(event) {
      return (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "Home" ||
        event.key === "End"
      );
    },
    onSample(sample) {
      if (sample.phase !== "down") return;

      if (sample.key === "Home") {
        options.onChange(options.min);
        return;
      }

      if (sample.key === "End") {
        options.onChange(options.max);
        return;
      }

      const direction =
        sample.key === "ArrowRight" || sample.key === "ArrowUp"
          ? 1
          : sample.key === "ArrowLeft" || sample.key === "ArrowDown"
            ? -1
            : 0;

      if (direction === 0) return;

      const multiplier = sample.modifiers.shift ? 5 : 1;
      options.onChange(
        clamp(
          stepValue(
            options.value + direction * step * multiplier,
            step,
            options.min,
          ),
          options.min,
          options.max,
        ),
      );
    },
  });
}
