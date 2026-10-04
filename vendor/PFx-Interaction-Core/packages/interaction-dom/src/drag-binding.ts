import { DragRecognizer, type DragOptions, type InteractionSnapshot } from '@pfx/interaction-core';
import { subscribeEscape } from './escape-manager.js';
import { bindPointerSensor, type DomBinding } from './pointer-sensor.js';

/** @public */
export type DragBindingEvent = PointerEvent | KeyboardEvent;

/** @public */
export interface DragBindingOptions extends DragOptions {
  readonly onChange: (snapshot: InteractionSnapshot, event: DragBindingEvent) => void;
  readonly touchAction?: string | null;
  readonly preventDefault?: boolean;
  readonly cancelOnEscape?: boolean;
}

/** @public */
export function bindDrag(element: HTMLElement, options: DragBindingOptions): DomBinding {
  const recognizer = new DragRecognizer(options);
  const touchAction = options.touchAction === undefined ? 'none' : options.touchAction;
  const pointerBinding = bindPointerSensor(element, {
    touchAction,
    ...(options.preventDefault !== undefined ? { preventDefault: options.preventDefault } : {}),
    onSample(sample, event) {
      const snapshot = recognizer.handle(sample);
      if (snapshot) options.onChange(snapshot, event);
    },
  });

  const unsubscribeEscape = (options.cancelOnEscape ?? true)
    ? subscribeEscape(element.ownerDocument, (event) => {
        const snapshot = recognizer.cancel(event.timeStamp);
        if (snapshot) options.onChange(snapshot, event);
      })
    : () => {};

  return {
    destroy() {
      unsubscribeEscape();
      pointerBinding.destroy();
    },
  };
}
