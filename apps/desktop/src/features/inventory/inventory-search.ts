/**
 * Stock Management's URL state (spec §6, stock-detail-modal-spec §13).
 *
 * The Stock/Trash switch lives in the search params rather than `useState`, so
 * `?tab=trash` is shareable and the back button returns to the list the operator
 * came from — the same convention `dispensing-search.ts` sets.
 *
 * `?item=` is the inbound half of the detail modal's "Open in Stock Management"
 * jump: an alert page links here with an id and the page preselects it.
 */

export type InventoryTab = "stock" | "trash";

export interface InventorySearch {
  /** Preselects this product in the detail panel. */
  item?: string;
  tab?: InventoryTab;
}

export function isInventoryTab(value: string): value is InventoryTab {
  return value === "stock" || value === "trash";
}

export function validateInventorySearch(
  search: Record<string, unknown>
): InventorySearch {
  const { item, tab } = search;
  const next: InventorySearch = {};

  if (typeof tab === "string" && isInventoryTab(tab) && tab !== "stock") {
    next.tab = tab;
  }
  if (typeof item === "string" && item.trim() !== "") {
    next.item = item.trim();
  }

  return next;
}

/** The default tab is omitted from the URL so the plain route stays `/admin/inventory`. */
export function inventorySearchFromTab(tab: InventoryTab): InventorySearch {
  return tab === "stock" ? {} : { tab };
}

export function inventorySearchEquals(
  a: InventorySearch,
  b: InventorySearch
): boolean {
  return (
    (a.tab ?? "stock") === (b.tab ?? "stock") &&
    (a.item ?? "") === (b.item ?? "")
  );
}
