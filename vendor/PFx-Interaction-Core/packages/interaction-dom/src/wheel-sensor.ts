import type { WheelSample } from '@pfx/interaction-core';
import { wheelSample } from './events.js';
import type { DomBinding } from './pointer-sensor.js';

/** @public */
export interface WheelSensorOptions {
  readonly onSample: (sample: WheelSample, event: WheelEvent) => void;
  readonly preventDefault?: boolean;
  readonly passive?: boolean;
}

/** @public */
export function bindWheelSensor(element: HTMLElement, options: WheelSensorOptions): DomBinding {
  const passive = options.preventDefault ? false : (options.passive ?? true);
  const onWheel = (event: WheelEvent) => {
    if (options.preventDefault) event.preventDefault();
    options.onSample(wheelSample(event), event);
  };
  element.addEventListener('wheel', onWheel, { passive });
  return {
    destroy() {
      element.removeEventListener('wheel', onWheel);
    },
  };
}
