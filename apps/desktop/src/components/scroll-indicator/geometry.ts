/**
 * Native scrollbar geometry, isolated from the DOM so it can be checked
 * directly: the thumb is the viewport's share of the content, and it travels
 * whatever track that share leaves over.
 */

/** Below this the pill is too short to aim at. */
export const MIN_THUMB_LENGTH = 24;

export interface Thumb {
  /** Thumb length along the track, in px. */
  length: number;
  /** Thumb offset from the track start, in px. */
  offset: number;
  /** How far the content can travel — the scroll range, in px. */
  scrollable: number;
}

const EMPTY: Thumb = { length: 0, offset: 0, scrollable: 0 };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * `track` is the visible box of the scroller, `viewport` how much of the
 * content it shows, `content` the full content, `position` the current
 * scroll offset. A `scrollable` of 0 means "nothing to scroll", which the
 * indicator layer reads as "hide me".
 */
export function measureThumb(
  track: number,
  viewport: number,
  content: number,
  position: number
): Thumb {
  if (track <= 0 || viewport <= 0 || content <= viewport) {
    return EMPTY;
  }
  const scrollable = content - viewport;
  const length = clamp(
    Math.round((track * viewport) / content),
    Math.min(MIN_THUMB_LENGTH, track),
    track
  );
  const ratio = clamp(position, 0, scrollable) / scrollable;
  return { length, offset: Math.round(ratio * (track - length)), scrollable };
}
