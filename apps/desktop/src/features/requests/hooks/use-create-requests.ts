import { useCallback, useEffect, useState } from "react";

import { useInventoryItems } from "@/features/inventory/hooks/use-inventory-items";
import type { InventoryItem } from "@/features/inventory/types";
import { getDb } from "@/lib/db";
import { notifyRequestsChanged, saveRequests } from "../persistence";
import { reserveRequestIds } from "../request-id";
import { toRequestUnit } from "../request-units";
import type { RequestItem, StatusHistoryEntry } from "../types";

/**
 * F2/F3/F5 — turning the form into cards.
 *
 * The form is staff-only and one request holds exactly one medicine (N1), so a
 * submission with several rows becomes several cards: their own reference, their
 * own history, their own row in `requests`. The alternative — a multi-item
 * request — would need the card, the kanban column, the dispensing record and
 * every transition guard to grow a list, which is a much larger change than the
 * request that prompted this work.
 */

const ACTOR = "You";

export interface RequestDraftRow {
  /** Stable key for React and for naming a row in an error message. */
  key: string;
  medicine: string;
  /** Raw input text — validation owns "is this a positive integer?". */
  qty: string;
  unit: string;
}

export interface NewRequestInput {
  reason: string;
  requestor: { email: string; id: string; name: string };
  rows: RequestDraftRow[];
  startReady: boolean;
}

export interface SkippedRow {
  key: string;
  message: string;
}

export interface CreateRequestsResult {
  created: RequestItem[];
  skipped: SkippedRow[];
}

export function normalizeMedicine(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Resolves typed text to the inventory item it names.
 *
 * Matched the same way `MEDICINE_WHERE_SQL` matches: the item's stored
 * `display_name` first (it is the canonical label and the string a request will
 * be compared against later), then the bare `name` for rows written before the
 * strength split. `requests.medicine` is free text with no foreign key (AF13),
 * so the text written here is what every later stock check will resolve against.
 */
export function matchInventoryItem(
  items: readonly InventoryItem[],
  text: string
): InventoryItem | null {
  const needle = normalizeMedicine(text);
  if (needle === "") {
    return null;
  }
  const byDisplay = items.find(
    (item) => normalizeMedicine(item.displayName) === needle
  );
  if (byDisplay) {
    return byDisplay;
  }
  return items.find((item) => normalizeMedicine(item.name) === needle) ?? null;
}

/** Autocomplete candidates, best (exact prefix) first. */
export function suggestInventoryItems(
  items: readonly InventoryItem[],
  query: string,
  limit = 6
): InventoryItem[] {
  const needle = normalizeMedicine(query);
  const pool =
    needle === ""
      ? [...items]
      : items.filter(
          (item) =>
            normalizeMedicine(item.displayName).includes(needle) ||
            normalizeMedicine(item.name).includes(needle)
        );
  return pool
    .sort((a, b) =>
      normalizeMedicine(a.displayName).localeCompare(
        normalizeMedicine(b.displayName)
      )
    )
    .slice(0, limit);
}

const DIGITS_ONLY = /^\d+$/;

/** Positive integers only — blank, zero, negative and non-numeric all fail. */
export function parseQuantity(raw: string): number | null {
  const text = raw.trim();
  if (!DIGITS_ONLY.test(text)) {
    return null;
  }
  const value = Number(text);
  return value > 0 ? value : null;
}

/**
 * Why a row cannot be submitted, or null when it is fine.
 *
 * An unknown medicine blocks (D11): with no inventory item there is nothing to
 * deduct later, and a card that can never be handed over is worse than a refused
 * submission. A quantity above what is on hand does **not** appear here — that is
 * a warning, not a block (D18).
 */
export function rowProblem(
  row: RequestDraftRow,
  items: readonly InventoryItem[]
): string | null {
  if (!matchInventoryItem(items, row.medicine)) {
    return `No inventory item matches “${row.medicine.trim() || "(blank)"}”. Pick one from the list.`;
  }
  if (parseQuantity(row.qty) === null) {
    return "Quantity must be a whole number greater than zero.";
  }
  return null;
}

/**
 * Pure card construction, kept out of React so the shape can be tested directly.
 * `ids` must line up with `rows` (see `reserveRequestIds`).
 */
export function buildRequestItems(
  input: NewRequestInput,
  items: readonly InventoryItem[],
  ids: readonly string[],
  at: string
): RequestItem[] {
  const created: RequestItem[] = [];
  input.rows.forEach((row, index) => {
    const item = matchInventoryItem(items, row.medicine);
    const qty = parseQuantity(row.qty);
    const id = ids[index];
    if (!(item && qty !== null && id)) {
      return;
    }
    // With the Ready toggle on, the history records the skip as one entry rather
    // than hiding it: the card never went through Pending, and the trail says so
    // (F5).
    const entry: StatusHistoryEntry = {
      at,
      by: ACTOR,
      from: null,
      ...(input.startReady
        ? { note: "Created straight into Ready to Claim" }
        : {}),
      to: input.startReady ? "ready" : "pending",
    };
    created.push({
      category: item.category,
      dispensingRecords: [],
      history: [entry],
      id,
      medicine: item.displayName,
      notes: [],
      qty,
      reason: input.reason,
      // Blank strings are a first-class anonymous requestor (D23); the card and
      // the detail view render them as "Walk-in".
      requestor: {
        email: input.requestor.email.trim(),
        id: input.requestor.id.trim(),
        name: input.requestor.name.trim(),
      },
      // Everything the form creates is a queued request, whatever column it
      // starts in; `quick-deduct` is only ever written by Ctrl+D (D14/D15).
      source: "queue",
      status: input.startReady ? "ready" : "pending",
      submittedAt: at,
      unit: toRequestUnit(row.unit),
    });
  });
  return created;
}

/**
 * The form's data layer: the inventory list the autocomplete reads, whether this
 * build can actually save (E15), and the submit that reserves references and
 * writes the cards.
 */
export function useCreateRequests() {
  const inventory = useInventoryItems();
  const [dbReady, setDbReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDb()
      .then(() => {
        if (!cancelled) {
          setDbReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDbReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = inventory.data ?? [];

  const create = useCallback(
    async (input: NewRequestInput): Promise<CreateRequestsResult> => {
      // Checked here as well as in the UI: without a database the writes below
      // are silent no-ops, and a form that reports three created requests that
      // nobody can ever read back is worse than a refusal (E15).
      try {
        await getDb();
      } catch (error) {
        throw new Error("No database available", { cause: error });
      }

      const skipped: SkippedRow[] = [];
      const valid: RequestDraftRow[] = [];
      for (const row of input.rows) {
        const problem = rowProblem(row, items);
        if (problem) {
          skipped.push({ key: row.key, message: problem });
        } else {
          valid.push(row);
        }
      }

      const ids = await reserveRequestIds(valid.length);
      const created = buildRequestItems(
        { ...input, rows: valid },
        items,
        ids,
        new Date().toISOString()
      );
      await saveRequests(created);
      notifyRequestsChanged();
      return { created, skipped };
    },
    [items]
  );

  return {
    create,
    dbReady,
    isLoadingItems: inventory.isLoading,
    items,
  } as const;
}
