/**
 * CMIS Cloud Sync — "something local changed, sync soon".
 *
 * The write paths (`persistence.ts` after a request is saved, and the React
 * Query mutation cache for everything else) call `scheduleSync()`; the provider
 * registers the handler that actually runs a sync. The indirection is what keeps
 * a data module from importing a React provider, and it makes the call sites
 * inert in tests and in the browser preview, where no handler is ever
 * registered.
 *
 * The debounce is the point: a board drag writes a request per keystroke-ish
 * gesture, and each one would otherwise be a round trip.
 */

type SyncScheduler = () => void;

let handler: SyncScheduler | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** How long a burst of local writes is allowed to settle before one sync. */
export const SYNC_DEBOUNCE_MS = 2500;

/**
 * Registers the one runner. Returns an unsubscribe, so the provider can hand
 * the responsibility back on unmount instead of leaving a closure holding a
 * stale database handle.
 */
export function registerSyncScheduler(next: SyncScheduler): () => void {
  handler = next;
  return () => {
    if (handler === next) {
      handler = null;
    }
    cancelScheduledSync();
  };
}

/** Schedules a sync after a quiet period. A no-op with no handler registered. */
export function scheduleSync(delayMs: number = SYNC_DEBOUNCE_MS): void {
  if (!handler) {
    return;
  }
  if (timer !== null) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    timer = null;
    handler?.();
  }, delayMs);
}

export function cancelScheduledSync(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

/** Test seam: whether a sync is queued right now. */
export function isSyncScheduled(): boolean {
  return timer !== null;
}
