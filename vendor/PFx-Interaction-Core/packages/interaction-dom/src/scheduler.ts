import type { Scheduler } from '@pfx/interaction-core';

/** @public */
export function createRafScheduler(): Scheduler {
  return {
    now: () => performance.now(),
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
  };
}
