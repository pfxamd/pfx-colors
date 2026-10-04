import { useEffect, useRef, type RefObject } from 'react';
import type { KeyboardSample } from '@pfx/interaction-core';
import { bindKeyboardSensor } from '@pfx/interaction-dom';

/** @public */
export interface UseKeyboardSensorOptions {
  readonly onSample: (sample: KeyboardSample, event: KeyboardEvent) => void;
  readonly preventDefault?: (event: KeyboardEvent) => boolean;
}

/** @public */
export function useKeyboardSensor<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: UseKeyboardSensorOptions,
): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const binding = bindKeyboardSensor(element, {
      ...(options.preventDefault ? { preventDefault: options.preventDefault } : {}),
      onSample(sample, event) {
        optionsRef.current.onSample(sample, event);
      },
    });
    return () => binding.destroy();
  }, [ref, options.preventDefault]);
}
