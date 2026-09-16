/**
 * Test-only stand-in for `@tanstack/react-virtual`.
 *
 * jsdom has no layout engine, so the real virtualizer measures a viewport of
 * zero height and renders nothing — every row would be absent from the DOM and
 * a row-interaction test would assert against an empty list. Windowing is the
 * library's concern; which rows exist and how they respond to a click, a key,
 * or a focus is ours, so the shim renders every row at its estimated size and
 * keeps the same accessor shape the components use.
 *
 * Use it with
 * `vi.mock("@tanstack/react-virtual", () => import("@/test/virtualizer-shim"))`.
 */

interface VirtualizerOptions {
  count: number;
  estimateSize: () => number;
}

export function useVirtualizer({ count, estimateSize }: VirtualizerOptions) {
  const size = estimateSize();
  return {
    getTotalSize: () => count * size,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        size,
        start: index * size,
      })),
    measureElement: () => undefined,
  };
}
