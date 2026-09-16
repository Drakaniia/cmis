/**
 * Stock detail modal's URL state (spec §13.1).
 *
 * The modal is deep-linkable so an operator can hand a colleague the exact
 * alert they are looking at, and so reopening a row survives a reload. Only two
 * params exist, both trimmed, both omitted when blank — a blank param is how the
 * close handler clears the URL without leaving `?item=` behind.
 */

export interface StockDetailSearch {
  batch?: string;
  item?: string;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function validateStockDetailSearch(
  search: Record<string, unknown>
): StockDetailSearch {
  const batch = readString(search.batch);
  const item = readString(search.item);

  return {
    ...(batch ? { batch } : {}),
    ...(item ? { item } : {}),
  };
}

const ITEM_GONE = "That item is no longer available";
const BATCH_GONE = "That batch is no longer available";

/**
 * What a `?item=` / `?batch=` link resolves to once the list is loaded.
 *
 * `index` points into the rows the caller passed, so the caller keeps its own
 * concrete row type instead of unwrapping a generic one.
 */
export type StockDetailLinkResolution =
  | { status: "idle" }
  | { index: number; status: "open" }
  | { message: string; status: "stale" };

interface ResolvableRow {
  batch?: { batch: string };
  item: { id: string };
}

/**
 * Decision 27 — a link that no longer resolves must never open a partial modal,
 * and must never leave dead params in the URL. The caller clears the params when
 * this comes back stale; the returned message is what it toasts.
 */
export function resolveStockDetailLink(
  search: StockDetailSearch,
  rows: ResolvableRow[],
  knownItemIds: string[]
): StockDetailLinkResolution {
  const { batch, item } = search;
  // A batch with nothing to anchor it to is meaningless, not stale.
  if (!item) {
    return { status: "idle" };
  }
  if (!knownItemIds.includes(item)) {
    return { message: ITEM_GONE, status: "stale" };
  }
  const index = rows.findIndex(
    (row) => row.item.id === item && (!batch || row.batch?.batch === batch)
  );
  if (index === -1) {
    return { message: BATCH_GONE, status: "stale" };
  }
  return { index, status: "open" };
}
