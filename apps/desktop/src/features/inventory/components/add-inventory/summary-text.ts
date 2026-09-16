import {
  type BatchDraft,
  draftTotalQty,
  earliestExpiry,
} from "../../creation/draft";
import { expiryLabel } from "../../domain/expiry";

/**
 * The one-line "3 batches · 450 units · earliest expiry Mar 2027" summary the
 * form, the batch editor and the review step all show (spec §7.2 §7.5).
 */

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function plural(count: number, one: string, many: string): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/** Rows worth counting: an untouched `+ Add batch` row is not a batch. */
function startedRows(rows: BatchDraft[]): BatchDraft[] {
  return rows.filter(
    (row) =>
      row.batch.trim() !== "" || row.expiry.trim() !== "" || row.qty !== ""
  );
}

export function batchSummary(rows: BatchDraft[]): string {
  const active = startedRows(rows);
  if (active.length === 0) {
    return "No batches yet";
  }
  const earliest = earliestExpiry(active);
  const parts = [
    plural(active.length, "batch", "batches"),
    `${formatCount(draftTotalQty(active))} units`,
  ];
  if (earliest) {
    parts.push(`earliest expiry ${expiryLabel(earliest)}`);
  }
  return parts.join(" · ");
}

/** `Mar 2027` — the review step's expiry shorthand. */
export function expMonthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function countSummary(products: number, batches: number): string {
  if (products === 0 && batches === 0) {
    return "Nothing to create";
  }
  return `${plural(products, "product", "products")} · ${plural(batches, "batch", "batches")}`;
}
