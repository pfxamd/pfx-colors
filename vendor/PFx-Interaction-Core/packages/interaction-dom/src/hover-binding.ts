import { HoverRecognizer, type HoverInput, type HoverState } from '@pfx/interaction-core';
import { clientPoint, modifierKeys, pointerKind } from './events.js';
import type { DomBinding } from './pointer-sensor.js';

/** @public */
export interface HoverBindingOptions {
  readonly onChange: (state: HoverState, event: PointerEvent) => void;
}

/** @public */
export function bindHover(element: HTMLElement, options: HoverBindingOptions): DomBinding {
  const recognizer = new HoverRecognizer();
  const emit = (event: PointerEvent, phase: HoverInput['phase']) => {
    const state = recognizer.handle({
      phase,
      timestamp: event.timeStamp,
      position: clientPoint(event),
      pointerType: pointerKind(event.pointerType),
      modifiers: modifierKeys(event),
    });
    if (state) options.onChange(state, event);
  };
  const onEnter = (event: PointerEvent) => emit(event, 'enter');
  const onMove = (event: PointerEvent) => emit(event, 'move');
  const onLeave = (event: PointerEvent) => emit(event, 'leave');
  element.addEventListener('pointerenter', onEnter);
  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerleave', onLeave);
  return {
    destroy() {
      element.removeEventListener('pointerenter', onEnter);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerleave', onLeave);
    },
  };
}
