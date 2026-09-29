/**
 * Input-idle gate for automatic updates.
 *
 * An automatic update must never land while someone is working. The gate
 * reports "nobody has touched this window for five minutes" from real input
 * events only — focus and blur are deliberately ignored, because an app left
 * open in the background is exactly the case this exists to catch.
 *
 * Manual checks never consult this: asking for an update is the user telling
 * us they are present.
 */

/** Five minutes without a single input event. */
export const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * `pointermove` fires continuously while a mouse rests on a moving surface, so
 * it is sampled rather than counted. The discrete events below stay exact.
 */
const MOVE_THROTTLE_MS = 250;

const listeners = new Set<() => void>();
let lastActivityAt = 0;
let lastMoveAt = 0;
let idle = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let detach: (() => void) | null = null;
let thresholdMs = IDLE_THRESHOLD_MS;

function emit(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

/**
 * Re-arm the countdown for exactly the time left, rather than polling on an
 * interval — a five-minute idle window should cost one timer, not 300 wakeups.
 */
function arm(): void {
  if (timer !== null) {
    clearTimeout(timer);
  }
  const remaining = Math.max(0, thresholdMs - (Date.now() - lastActivityAt));
  timer = setTimeout(() => {
    timer = null;
    if (idle) {
      return;
    }
    idle = true;
    emit();
  }, remaining);
}

function markActive(): void {
  lastActivityAt = Date.now();
  if (idle) {
    idle = false;
    emit();
  }
  arm();
}

function onMove(): void {
  const now = Date.now();
  if (now - lastMoveAt < MOVE_THROTTLE_MS) {
    return;
  }
  lastMoveAt = now;
  markActive();
}

/** True once the app has gone untouched for the whole threshold. */
export function isAppIdle(): boolean {
  return idle;
}

/** Notifies on every idle/active transition. */
export function subscribeIdle(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Begin watching for input. Idempotent, and returns its own teardown so a
 * component can scope the listeners to its own lifetime.
 */
export function startIdleTracking(
  nextThresholdMs: number = IDLE_THRESHOLD_MS
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  if (detach) {
    return detach;
  }
  thresholdMs = nextThresholdMs;
  // The window counts as active from the moment tracking starts, so a fresh
  // launch still gets the full grace period before anything downloads itself.
  lastActivityAt = Date.now();
  idle = false;

  const options: AddEventListenerOptions = { passive: true };
  window.addEventListener("pointermove", onMove, options);
  window.addEventListener("pointerdown", markActive, options);
  window.addEventListener("keydown", markActive, options);
  window.addEventListener("wheel", markActive, options);
  arm();

  detach = () => {
    window.removeEventListener("pointermove", onMove, options);
    window.removeEventListener("pointerdown", markActive, options);
    window.removeEventListener("keydown", markActive, options);
    window.removeEventListener("wheel", markActive, options);
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    detach = null;
  };
  return detach;
}

export function __resetIdleTrackingForTests(): void {
  detach?.();
  listeners.clear();
  lastActivityAt = 0;
  lastMoveAt = 0;
  idle = false;
  thresholdMs = IDLE_THRESHOLD_MS;
}
