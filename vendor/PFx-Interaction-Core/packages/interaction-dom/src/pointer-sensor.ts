import type { PointerSample, Point } from '@pfx/interaction-core';
import { pointerSample } from './events.js';

/** @public */
export interface PointerSensorOptions {
  readonly onSample: (sample: PointerSample, event: PointerEvent) => void;
  readonly mapPosition?: (event: PointerEvent) => Point;
  readonly capture?: boolean;
  readonly touchAction?: string | null;
  readonly preventDefault?: boolean;
}

/** @public */
export interface DomBinding {
  destroy(): void;
}

/** @public */
export function bindPointerSensor(element: HTMLElement, options: PointerSensorOptions): DomBinding {
  const previousPositions = new Map<number, Point>();
  const capture = options.capture ?? true;
  const shouldManageTouchAction = options.touchAction !== undefined && options.touchAction !== null;
  const oldTouchAction = element.style.touchAction;

  if (shouldManageTouchAction) element.style.touchAction = options.touchAction ?? '';

  const emit = (event: PointerEvent, phase: PointerSample['phase']) => {
    if (options.preventDefault) event.preventDefault();
    const previous = previousPositions.get(event.pointerId) ?? null;
    const sample = pointerSample(event, phase, previous, options.mapPosition);
    if (phase === 'down' || phase === 'move') previousPositions.set(event.pointerId, sample.position);
    else previousPositions.delete(event.pointerId);
    options.onSample(sample, event);
  };

  const onDown = (event: PointerEvent) => {
    if (capture && !element.hasPointerCapture(event.pointerId)) {
      element.setPointerCapture(event.pointerId);
    }
    emit(event, 'down');
  };
  const onMove = (event: PointerEvent) => emit(event, 'move');
  const onUp = (event: PointerEvent) => {
    emit(event, 'up');
    if (capture && element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
  };
  const onCancel = (event: PointerEvent) => emit(event, 'cancel');
  const onLostCapture = (event: PointerEvent) => {
    if (!previousPositions.has(event.pointerId)) return;
    emit(event, 'cancel');
  };

  element.addEventListener('pointerdown', onDown);
  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerup', onUp);
  element.addEventListener('pointercancel', onCancel);
  element.addEventListener('lostpointercapture', onLostCapture);

  return {
    destroy() {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onCancel);
      element.removeEventListener('lostpointercapture', onLostCapture);
      previousPositions.clear();
      if (shouldManageTouchAction) element.style.touchAction = oldTouchAction;
    },
  };
}
