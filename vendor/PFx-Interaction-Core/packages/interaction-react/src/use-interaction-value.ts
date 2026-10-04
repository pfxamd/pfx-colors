import { useSyncExternalStore } from 'react';
import type { InteractionValue } from '@pfx/interaction-core';

/** @public */
export function useInteractionValue<T>(value: InteractionValue<T>): T {
  return useSyncExternalStore(
    (onStoreChange) => value.subscribe(() => onStoreChange()),
    () => value.get(),
    () => value.get(),
  );
}
