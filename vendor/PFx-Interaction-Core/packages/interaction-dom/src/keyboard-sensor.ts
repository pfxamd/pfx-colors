import type { KeyboardSample } from '@pfx/interaction-core';
import { keyboardSample } from './events.js';
import type { DomBinding } from './pointer-sensor.js';

/** @public */
export interface KeyboardSensorOptions {
  readonly onSample: (sample: KeyboardSample, event: KeyboardEvent) => void;
  readonly preventDefault?: (event: KeyboardEvent) => boolean;
}

/** @public */
export function bindKeyboardSensor(element: HTMLElement, options: KeyboardSensorOptions): DomBinding {
  const emit = (event: KeyboardEvent, phase: KeyboardSample['phase']) => {
    if (options.preventDefault?.(event)) event.preventDefault();
    options.onSample(keyboardSample(event, phase), event);
  };
  const onDown = (event: KeyboardEvent) => emit(event, 'down');
  const onUp = (event: KeyboardEvent) => emit(event, 'up');
  element.addEventListener('keydown', onDown);
  element.addEventListener('keyup', onUp);
  return {
    destroy() {
      element.removeEventListener('keydown', onDown);
      element.removeEventListener('keyup', onUp);
    },
  };
}
