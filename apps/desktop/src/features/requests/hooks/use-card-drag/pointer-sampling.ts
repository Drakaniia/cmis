/** The subset of a pointer event the engine actually reads. */
export interface PointerSample {
  clientX: number;
  clientY: number;
  pointerId: number;
}

/** How many recent pointer positions the release velocity is read from. */
export const HISTORY_LIMIT = 6;

/**
 * A window DOM pointer event typed as the three fields the engine reads, so the
 * window listeners stay plain `EventListener`s without a second name for the
 * same thing.
 */
export function toPointerSample(event: Event): PointerSample {
  const { clientX, clientY, pointerId } = event as unknown as PointerSample;
  return { clientX, clientY, pointerId };
}
