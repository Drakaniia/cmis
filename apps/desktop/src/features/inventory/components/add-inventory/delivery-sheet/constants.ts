import { SHEET_COLUMNS } from "../../../creation/paste";

/** Action column width, and the two row heights the virtualizer estimates. */
export const ACTION_WIDTH = 150;
export const GROUP_ROW_HEIGHT = 96;
export const BATCH_ROW_HEIGHT = 48;

const px = (width: number): string => `${width}px`;

/**
 * Read-only context on a batch row: what the group already carries, or an em
 * dash when the group left the field blank.
 */
export const inherited = (value: string): string =>
  value.trim() === "" ? "—" : value;

const FROZEN = SHEET_COLUMNS.filter((column) => column.frozen);
const FROZEN_WIDTH = FROZEN.reduce((sum, column) => sum + column.width, 0);
export const FIRST_FROZEN_WIDTH = FROZEN[0]?.width ?? 0;

/** Batch rows track every column; the group row spans the batch columns. */
export const BATCH_TEMPLATE = [
  ...SHEET_COLUMNS.map((column) => column.width),
  ACTION_WIDTH,
]
  .map(px)
  .join(" ");

export const GROUP_TEMPLATE = [
  FIRST_FROZEN_WIDTH,
  FROZEN_WIDTH - FIRST_FROZEN_WIDTH,
  ...SHEET_COLUMNS.slice(FROZEN.length).map((column) => column.width),
  ACTION_WIDTH,
]
  .map(px)
  .join(" ");

export const HEADER_TEMPLATE = BATCH_TEMPLATE;
