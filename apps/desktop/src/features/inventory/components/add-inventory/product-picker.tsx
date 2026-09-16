import { cn } from "@cmis/ui/lib/utils";
import { Search } from "lucide-react";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import { expiryLabel } from "../../domain/expiry";
import type { InventoryItem } from "../../types";
import { HINT_CLASS } from "./field-styles";
import { formatCount, plural } from "./summary-text";

/**
 * Spec §7.3 — the product picker for Path 2.
 *
 * The predicate is the Stock In wizard's `lookup()` (name, SKU, barcode), so
 * "type a code, get the product" behaves the same in both intake surfaces.
 * Existing lots are listed read-only underneath: the duplicate check happens in
 * validation, and the operator needs to *see* which numbers are taken.
 */

export function matchesItem(item: InventoryItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") {
    return true;
  }
  return (
    item.name.toLowerCase().includes(q) ||
    item.displayName.toLowerCase().includes(q) ||
    item.sku.toLowerCase().includes(q) ||
    (item.barcode ?? "").toLowerCase().includes(q)
  );
}

export function ProductPicker({
  onSelect,
  items,
  selectedId,
}: {
  items: InventoryItem[];
  onSelect: (itemId: string) => void;
  selectedId: string | null;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(
    () => items.filter((item) => matchesItem(item, query)),
    [items, query]
  );
  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );

  const handleSelect = useCallback(
    (itemId: string) => () => onSelect(itemId),
    [onSelect]
  );
  const handleQuery = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
    []
  );

  return (
    <div className="space-y-3">
      <label className="block font-medium text-caption text-foreground">
        Product
        <span className="relative mt-1 block">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="w-full rounded-md border border-input bg-background py-2 pr-3 pl-8 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            onChange={handleQuery}
            placeholder="Search by name, SKU or barcode"
            value={query}
          />
        </span>
      </label>

      {selected ? (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="font-semibold text-sm">{selected.name}</p>
          <p className="text-caption text-muted-foreground">
            {selected.sku} · {selected.category} · Qty:{" "}
            {formatCount(selected.qty)} ·{" "}
            {plural(selected.batches.length, "batch", "batches")}
          </p>
        </div>
      ) : (
        <p className={HINT_CLASS}>Choose the product these lots belong to.</p>
      )}

      <ul
        aria-label="Products in inventory"
        className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border bg-card p-1"
      >
        {matches.length === 0 ? (
          <li className="px-3 py-2 text-caption text-muted-foreground">
            No product matches “{query.trim()}”.
          </li>
        ) : (
          matches.map((item) => (
            <li key={item.id}>
              <button
                aria-current={item.id === selectedId}
                className={cn(
                  "press-feedback flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left",
                  item.id === selectedId
                    ? "bg-muted font-semibold"
                    : "hover:bg-muted/60"
                )}
                onClick={handleSelect(item.id)}
                type="button"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {item.displayName}
                </span>
                <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
                  Qty: {formatCount(item.qty)} · {item.sku}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>

      {selected && selected.batches.length > 0 ? (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="font-medium text-caption text-foreground">
            Existing batches (read-only)
          </p>
          <ul className="mt-1 space-y-0.5">
            {selected.batches.map((batch) => (
              <li
                className="flex items-center justify-between text-caption text-muted-foreground"
                key={`${batch.batch}-${batch.expiry}`}
              >
                <span>{batch.batch}</span>
                <span className="tabular-nums">
                  {formatCount(batch.qty)} units
                  {batch.expiry ? ` · exp ${expiryLabel(batch.expiry)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
