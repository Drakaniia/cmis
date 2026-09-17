import type { DispensingRow } from "./types";
import { toDispensingSource } from "./types";

/**
 * CMIS-UI-06 §2 — stored rows → log rows, kept pure so the shape is testable
 * without a database.
 *
 * The log is built from `dispensing_records`, which is one row per hand-over: a
 * partial dispense is two rows, and a quick deduction is a row whose request was
 * created by the `Ctrl+D` form. Everything the table and the export need — the
 * requestor, the SKU, and crucially **how the row got here** — is joined in from
 * `requests` and `inventory_items`, because the record itself only knows the
 * request id.
 *
 * A row whose request is missing (a request deleted after the fact) is kept: the
 * movement happened, and an audit log that drops records it cannot fully explain
 * is worse than one that shows a gap.
 */

const DEFAULT_BRANCH = "Local";
const WALK_IN_LABEL = "Walk-in";

/** What `dispensing_records` holds, as this module needs it. */
export interface DispensingRecordSource {
  at: string;
  batch: string;
  id: number;
  qty: number;
  request_id: string;
  staff: string;
}

/** The request side of the join. `source` arrives with migration 0008. */
export interface DispensingRequestSource {
  id: string;
  medicine: string;
  requestor_id: string;
  requestor_name: string;
  source?: string | null;
}

/** The inventory side, used only to name the medicine's SKU. */
export interface DispensingItemSource {
  display_name?: string | null;
  name: string;
  sku: string;
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

/**
 * SKUs by the label a request stores. `requests.medicine` is free text matched
 * against the item's `display_name` (there is no foreign key), so the map is
 * keyed the same way, with the bare name as a fallback for rows written before
 * the strength split.
 */
export function skuIndex(
  items: readonly DispensingItemSource[]
): Map<string, string> {
  const index = new Map<string, string>();
  for (const item of items) {
    for (const key of [item.display_name, item.name]) {
      const normalized = normalize(key);
      if (normalized !== "" && !index.has(normalized)) {
        index.set(normalized, item.sku);
      }
    }
  }
  return index;
}

/** `DSP-000123` — a row reference stable enough to read out loud. */
function rowId(recordId: number): string {
  return `DSP-${String(recordId).padStart(6, "0")}`;
}

/**
 * Newest first. The page sorts again for its own column, but this keeps the
 * default order (and the export) deterministic without depending on the order
 * SQLite happened to return.
 */
export function buildDispensingRows(
  records: readonly DispensingRecordSource[],
  requests: readonly DispensingRequestSource[],
  items: readonly DispensingItemSource[]
): DispensingRow[] {
  const requestsById = new Map(
    requests.map((request) => [request.id, request])
  );
  const skus = skuIndex(items);

  return [...records]
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((record) => {
      const request = requestsById.get(record.request_id);
      const medicine = request?.medicine ?? "";
      const name = request?.requestor_name ?? "";
      return {
        batch: record.batch,
        branch: DEFAULT_BRANCH,
        dispensedAt: record.at,
        id: rowId(record.id),
        medicine,
        medicineSku: skus.get(normalize(medicine)) ?? "",
        qty: record.qty,
        requestLink: request ? record.request_id : null,
        // Blank requestor details are a first-class anonymous request (D23),
        // and a quick deduction is anonymous by construction.
        requestor: name.trim() === "" ? WALK_IN_LABEL : name,
        requestorId: request?.requestor_id ?? "",
        source: toDispensingSource(request?.source),
        staff: record.staff,
        status: "dispensed",
      };
    });
}
