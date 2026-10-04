import { useEffect, useRef, type RefObject } from 'react';
import type { DragOptions, InteractionSnapshot } from '@pfx/interaction-core';
import { bindDrag, type DragBindingEvent } from '@pfx/interaction-dom';

/** @public */
export interface UseDragOptions extends DragOptions {
  readonly onChange: (snapshot: InteractionSnapshot, event: DragBindingEvent) => void;
  readonly touchAction?: string | null;
  readonly preventDefault?: boolean;
  readonly cancelOnEscape?: boolean;
}

/** @public */
export function useDrag<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: UseDragOptions,
): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const binding = bindDrag(element, {
      ...(options.activationDistance !== undefined
        ? { activationDistance: options.activationDistance }
        : {}),
      ...(options.touchAction !== undefined ? { touchAction: options.touchAction } : {}),
      ...(options.preventDefault !== undefined ? { preventDefault: options.preventDefault } : {}),
      ...(options.cancelOnEscape !== undefined ? { cancelOnEscape: options.cancelOnEscape } : {}),
      onChange(snapshot, event) {
        optionsRef.current.onChange(snapshot, event);
      },
    });
    return () => binding.destroy();
  }, [
    ref,
    options.activationDistance,
    options.touchAction,
    options.preventDefault,
    options.cancelOnEscape,
  ]);
}
