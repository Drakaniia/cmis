import type { Row } from "../rows";
import type { TrashEntry } from "./types";
import { text } from "./utils";

/** The label the rest of the app shows for a product. */
export function productLabel(item: Row): string {
  const display = text(item.display_name).trim();
  if (display) {
    return display;
  }
  const name = text(item.name).trim();
  const dosage = text(item.dosage).trim();
  return dosage ? `${name} ${dosage}` : name;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** `3 batches · 450 units` / `200 units · exp 2027-03-01` — the Trash Detail column. */
export function describeTrashEntry(entry: TrashEntry): string {
  if (entry.kind === "batch") {
    const expiry = entry.expiry ? ` · exp ${entry.expiry}` : "";
    return `${entry.totalQty} units${expiry}`;
  }
  const batches =
    entry.batchCount === 0
      ? "No batches"
      : `${entry.batchCount} ${plural(entry.batchCount, "batch", "batches")}`;
  return `${batches} · ${entry.totalQty} units`;
}

export function pluralBatches(count: number): string {
  return `${count} ${plural(count, "batch", "batches")}`;
}

export function pluralRecords(count: number): string {
  return `${count} ${plural(count, "record", "records")}`;
}

/** Picks the first free `base`, `base-2`, `base-3`, … for a restore collision. */
export function nextFreeSku(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}
