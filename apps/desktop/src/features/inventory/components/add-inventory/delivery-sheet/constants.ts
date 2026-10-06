import { SHEET_COLUMNS } from "../../../creation/paste";

/** Action column width, and the two row heights the virtualizer estimates. */
export const ACTION_WIDTH = 150;
/** 32px control + 16px vertical padding + 1px border. */
export const GROUP_ROW_HEIGHT = 49;
/** 32px control + 12px vertical padding + 1px border. */
export const BATCH_ROW_HEIGHT = 45;

/** Must match the grid's `gap-x-2` (8px) so sticky offsets land correctly. */
export const GRID_GAP = 8;

const px = (width: number): string => `${width}px`;

/**
 * Read-only context on a batch row: what the group already carries, or an em
 * dash when the group left the field blank.
 */
export const inherited = (value: string): string =>
  value.trim() === "" ? "—" : value;

/** Batch rows track every column; group rows share the same tracks so the
 * header stays aligned — the group summary spans the batch/expiry/qty tracks. */
export const BATCH_TEMPLATE = [
  ...SHEET_COLUMNS.map((column) => column.width),
  ACTION_WIDTH,
]
  .map(px)
  .join(" ");

export const GROUP_TEMPLATE = BATCH_TEMPLATE;

export const HEADER_TEMPLATE = BATCH_TEMPLATE;
