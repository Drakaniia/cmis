import { useCallback, useMemo, useRef, useState } from "react";

import { canMove } from "../transitions";
import type {
  DenyReason,
  DispensingRecord,
  RequestItem,
  RequestStatus,
  StatusHistoryEntry,
} from "../types";

/** Every structural move goes through the guards in `transitions.ts`. */
export type MoveOutcome =
  | { from: RequestStatus; item: RequestItem; index: number; ok: true }
  | { ok: false; reason: "forbidden" };

/**
 * What a completed hand-over produced: the record to append, and how much of the
 * request is still outstanding.
 *
 * The stock movement itself happens in `deduct-stock.ts` *before* this is
 * applied — the board records the outcome rather than reaching for the database,
 * which keeps it the pure, synchronous state machine it has always been.
 */
export interface DispenseOutcome {
  record: DispensingRecord;
  /**
   * Above zero keeps the card in Ready to Claim with a reduced `qty` (a partial
   * hand-over, D4); zero moves it to Claimed.
   */
  remainingQty: number;
}

const ACTOR = "You";

function appendHistory(
  item: RequestItem,
  to: RequestStatus,
  note?: string
): StatusHistoryEntry[] {
  return [
    ...item.history,
    {
      at: new Date().toISOString(),
      by: ACTOR,
      from: item.status,
      ...(note ? { note } : {}),
      to,
    },
  ];
}

export function countInStatus(
  items: RequestItem[],
  status: RequestStatus
): number {
  let count = 0;
  for (const item of items) {
    if (item.status === status) {
      count += 1;
    }
  }
  return count;
}

/**
 * Rebuilds the flat list with `moved` inserted at `index` among the items that
 * already share its new status, leaving every other column's order untouched.
 * The array is the board's single ordering source, so this is where a drop
 * index becomes durable order.
 */
function withInserted(
  items: RequestItem[],
  moved: RequestItem,
  status: RequestStatus,
  index: number
): RequestItem[] {
  const target = items.filter((item) => item.status === status);
  const clamped = Math.max(0, Math.min(index, target.length));
  const reordered = [
    ...target.slice(0, clamped),
    moved,
    ...target.slice(clamped),
  ];

  const result: RequestItem[] = [];
  let cursor = 0;
  for (const item of items) {
    if (item.status === status) {
      result.push(reordered[cursor]);
      cursor += 1;
    } else {
      result.push(item);
    }
  }
  // The moved item adds one extra slot — push any that remain.
  while (cursor < reordered.length) {
    result.push(reordered[cursor]);
    cursor += 1;
  }
  return result;
}

/**
 * `onPersist` receives every request whose stored state changed, so the caller
 * can write it through to SQLite without the hook knowing about storage.
 */
export function useRequestBoard(
  initial: RequestItem[],
  onPersist?: (item: RequestItem) => void
) {
  const [items, setItems] = useState<RequestItem[]>(initial);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [lastMove, setLastMove] = useState<{
    entries: { from: RequestStatus; id: string; index: number }[];
  } | null>(null);

  const persistRef = useRef(onPersist);
  persistRef.current = onPersist;
  // Once a card has been touched, hydration must not clobber the live board.
  const dirtyRef = useRef(false);

  const persist = useCallback((changed: RequestItem[]) => {
    dirtyRef.current = true;
    for (const item of changed) {
      persistRef.current?.(item);
    }
  }, []);

  /** Adopts state read from disk, unless the user already changed something. */
  const replaceAll = useCallback((next: RequestItem[]) => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: ref is mutated by persist()
    if (dirtyRef.current) {
      return false;
    }
    setItems(next);
    return true;
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectMany = useCallback((ids: string[], select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  /**
   * Approve / prepare / re-open / reorder — one guarded implementation so the
   * menu, the modal footer, the keyboard and the drag engine all behave
   * identically. `index` is the drop position within the destination column.
   */
  const moveRequestAt = useCallback(
    (id: string, to: RequestStatus, index: number): MoveOutcome => {
      const current = items.find((item) => item.id === id);
      if (!(current && canMove(current.status, to))) {
        return { ok: false, reason: "forbidden" };
      }
      const from = current.status;
      const moved: RequestItem = {
        ...current,
        history: appendHistory(current, to),
        status: to,
      };
      setItems((prev) =>
        withInserted(
          prev.filter((item) => item.id !== id),
          moved,
          to,
          index
        )
      );
      setLastMove({ entries: [{ from, id, index }] });
      persist([moved]);
      return { from, index, item: moved, ok: true };
    },
    [items, persist]
  );

  /** Menu/keyboard moves land at the end of the destination column. */
  const moveRequest = useCallback(
    (id: string, to: RequestStatus): MoveOutcome =>
      moveRequestAt(id, to, countInStatus(items, to)),
    [items, moveRequestAt]
  );

  /** Bulk move — every legal member moves, illegal ones are silently skipped. */
  const moveRequests = useCallback(
    (ids: string[], to: RequestStatus): number => {
      const moving = items.filter(
        (item) => ids.includes(item.id) && canMove(item.status, to)
      );
      if (moving.length === 0) {
        return 0;
      }
      const movingIds = new Set(moving.map((item) => item.id));
      const moved = moving.map<RequestItem>((item) => ({
        ...item,
        history: appendHistory(item, to),
        status: to,
      }));
      setItems((prev) => {
        let next = prev.filter((item) => !movingIds.has(item.id));
        for (const item of moved) {
          next = withInserted(
            next,
            item,
            to,
            next.filter((candidate) => candidate.status === to).length
          );
        }
        return next;
      });
      setLastMove({
        entries: moving.map((item) => ({
          from: item.status,
          id: item.id,
          index: 0,
        })),
      });
      persist(moved);
      return moved.length;
    },
    [items, persist]
  );

  const denyRequests = useCallback(
    (ids: string[], reason: DenyReason, note: string): number => {
      const denyable = items.filter(
        (item) => ids.includes(item.id) && canMove(item.status, "denied")
      );
      if (denyable.length === 0) {
        return 0;
      }
      const updated = denyable.map<RequestItem>((item) => ({
        ...item,
        deniedNote: note || undefined,
        deniedReason: reason,
        history: appendHistory(item, "denied", note || undefined),
        status: "denied" as const,
      }));
      const byId = new Map(updated.map((item) => [item.id, item]));
      setItems((prev) => prev.map((item) => byId.get(item.id) ?? item));
      setLastMove(null);
      persist(updated);
      return updated.length;
    },
    [items, persist]
  );

  /**
   * Records one completed hand-over. A partial keeps the card in Ready to Claim
   * with the outstanding quantity and an explicit history entry, so the skip is
   * visible in the audit trail rather than hidden behind a reduced number.
   */
  const markDispensed = useCallback(
    (id: string, outcome: DispenseOutcome): boolean => {
      const current = items.find((item) => item.id === id);
      if (!(current && canMove(current.status, "claimed"))) {
        return false;
      }
      const partial = outcome.remainingQty > 0;
      const next: RequestItem = {
        ...current,
        dispensingRecords: [...current.dispensingRecords, outcome.record],
        history: partial
          ? appendHistory(
              current,
              "ready",
              `Dispensed ${outcome.record.qty} ${current.unit} — ${outcome.remainingQty} still outstanding`
            )
          : appendHistory(current, "claimed"),
        qty: partial ? outcome.remainingQty : current.qty,
        status: partial ? "ready" : "claimed",
      };
      setItems((prev) => prev.map((item) => (item.id === id ? next : item)));
      // A dispense moves real stock, so it is never offered an undo (D12/F12).
      setLastMove(null);
      persist([next]);
      return true;
    },
    [items, persist]
  );

  /**
   * Bulk dispense — each request keeps its own record, so staff can confirm a
   * whole column without the hand-overs collapsing into one.
   */
  const markDispensedMany = useCallback(
    (outcomes: { id: string; outcome: DispenseOutcome }[]): number => {
      const byId = new Map(outcomes.map((entry) => [entry.id, entry.outcome]));
      const updated: RequestItem[] = [];
      for (const item of items) {
        const outcome = byId.get(item.id);
        if (!(outcome && canMove(item.status, "claimed"))) {
          continue;
        }
        const partial = outcome.remainingQty > 0;
        updated.push({
          ...item,
          dispensingRecords: [...item.dispensingRecords, outcome.record],
          history: partial
            ? appendHistory(
                item,
                "ready",
                `Dispensed ${outcome.record.qty} ${item.unit} — ${outcome.remainingQty} still outstanding`
              )
            : appendHistory(item, "claimed"),
          qty: partial ? outcome.remainingQty : item.qty,
          status: partial ? "ready" : "claimed",
        });
      }
      if (updated.length === 0) {
        return 0;
      }
      const updatedById = new Map(updated.map((item) => [item.id, item]));
      setItems((prev) => prev.map((item) => updatedById.get(item.id) ?? item));
      setLastMove(null);
      persist(updated);
      return updated.length;
    },
    [items, persist]
  );

  /**
   * Drops requests from the board after they have been deleted on disk. Only
   * Pending cards are ever offered Cancel (F6), so the caller has already
   * applied that guard — this is the state half of the removal.
   */
  const removeRequests = useCallback((ids: string[]): number => {
    const removing = new Set(ids);
    setItems((prev) => prev.filter((item) => !removing.has(item.id)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        next.delete(id);
      }
      return next;
    });
    // A deleted card cannot be undone back into existence.
    setLastMove(null);
    return removing.size;
  }, []);

  const addNote = useCallback(
    (id: string, text: string) => {
      const trimmed = text.trim();
      const current = items.find((item) => item.id === id);
      if (!(trimmed && current)) {
        return;
      }
      const next: RequestItem = {
        ...current,
        notes: [
          ...current.notes,
          { at: new Date().toISOString(), author: ACTOR, text: trimmed },
        ],
      };
      setItems((prev) => prev.map((item) => (item.id === id ? next : item)));
      persist([next]);
    },
    [items, persist]
  );

  /**
   * Undo the last structural move — Apple §16 Agency: easy undo for slips.
   * Dispense and Deny are excluded: both write audit records, and a dispense has
   * moved real stock off the shelf as well (D12).
   */
  const undoLastMove = useCallback(() => {
    if (!lastMove) {
      return false;
    }
    const entries = new Map(lastMove.entries.map((entry) => [entry.id, entry]));
    const reverted: RequestItem[] = [];
    for (const item of items) {
      const entry = entries.get(item.id);
      if (entry) {
        reverted.push({
          ...item,
          history: item.history.slice(0, -1),
          status: entry.from,
        });
      }
    }
    const byId = new Map(reverted.map((item) => [item.id, item]));
    setItems((prev) => prev.map((item) => byId.get(item.id) ?? item));
    setLastMove(null);
    persist(reverted);
    return true;
  }, [items, lastMove, persist]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  return {
    addNote,
    clearSelection,
    denyRequests,
    items,
    markDispensed,
    markDispensedMany,
    moveRequest,
    moveRequestAt,
    moveRequests,
    removeRequests,
    replaceAll,
    selectedIds,
    selectedItems,
    selectMany,
    toggleSelect,
    undoLastMove,
  } as const;
}
