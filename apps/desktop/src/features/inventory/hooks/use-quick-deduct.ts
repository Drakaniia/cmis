/**
 * F2/F3/F5 — the quick deduction's data layer.
 *
 * `Ctrl+D` exists because not every hand-over deserves the approval workflow and
 * because the five-step stock-out wizard is the wrong shape for a customer
 * standing at the counter (the request this spec answers). So the form is two
 * fields and this hook is the whole rest of it: it reserves a request reference,
 * asks the **shared** deduction service for the write — with quick deduct's two
 * policy differences, a refusal instead of a partial and permission to take from
 * an item that has no batch rows — and only then records the card, so a card can
 * never claim a hand-over the shelf never saw.
 *
 * The request it creates is otherwise ordinary: it lands in Claimed, shows
 * "Walk-in", is written through the same `saveRequest` the queue uses, and
 * counts in the Dispensing Log and the analytics. `source` is what marks it as
 * this path rather than a queued walk-in.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useInventoryItems } from "@/features/inventory/hooks/use-inventory-items";
import type { InventoryItem } from "@/features/inventory/types";
import {
  type DeductPlan,
  type DeductSnapshot,
  deductStock,
  planDeduction,
  undoStock,
} from "@/features/requests/deduct-stock";
import {
  deleteRequest,
  notifyRequestsChanged,
  saveRequest,
} from "@/features/requests/persistence";
import { reserveRequestIds } from "@/features/requests/request-id";
import { defaultUnitForItem } from "@/features/requests/request-units";
import type { RequestItem } from "@/features/requests/types";
import { getDb } from "@/lib/db";

/**
 * The two deliberate divergences from queue dispensing (spec §13): short stock
 * is refused rather than part-handed over (D9), and an item with no batch rows
 * deducts from its total rather than blocking a counter hand-over (D7).
 */
const QUICK_DEDUCT_OPTIONS = {
  allowMissingBatch: true,
  allowPartial: false,
} as const;

/** OQ1 — short enough that the state the undo reverses is still the captured state. */
export const UNDO_WINDOW_MS = 5000;

/** A stable id, so a second deduction replaces the first's undo action (D8). */
const TOAST_ID = "quick-deduct";

const ACTOR = "You";

/** The item picker only ever offers something that can actually be taken. */
export function dispensableItems(
  items: readonly InventoryItem[]
): InventoryItem[] {
  return items.filter((item) => item.qty > 0);
}

export interface QuickDeductInput {
  item: InventoryItem;
  qty: number;
}

export type QuickDeductOutcome =
  | { ok: true; card: RequestItem; plan: DeductPlan; snapshot: DeductSnapshot }
  | { ok: false; message: string };

export type QuickUndoOutcome = { ok: true } | { ok: false; message: string };

/** F6 — what the deduction left behind, in the operator's words. */
export function standingAfter(plan: DeductPlan): string {
  if (plan.leftAfter === 0) {
    return "now out of stock";
  }
  if (plan.leftAfter <= plan.threshold) {
    return `${plan.leftAfter} left — at or below its threshold of ${plan.threshold}`;
  }
  return `${plan.leftAfter} left`;
}

/** "3 tabs from batch B-4412" — the plan summary both the form and the toast use. */
export function planSummary(plan: DeductPlan): string {
  const batches = plan.batches.map((take) => take.batch).join(", ");
  return batches === ""
    ? `${plan.take} ${plan.unit} off the item total`
    : `${plan.take} ${plan.unit} from batch ${batches}`;
}

/**
 * The read-only plan the form shows before it is confirmed: which batch(es) will
 * be taken, and what is left afterwards. It runs against the same service the
 * write does, so the line the operator checks and the take they get cannot
 * disagree, and expired batches never appear in it.
 */
export function useQuickDeductPlan(item: InventoryItem | null, qty: number) {
  return useQuery({
    enabled: item !== null && qty > 0,
    queryFn: async () =>
      item === null
        ? null
        : await planDeduction(
            item.displayName,
            qty,
            defaultUnitForItem(item),
            QUICK_DEDUCT_OPTIONS,
            item.id
          ),
    queryKey: ["quick-deduct-plan", item?.id ?? "none", qty],
    retry: false,
    staleTime: 0,
  });
}

export function useQuickDeduct() {
  const inventory = useInventoryItems();
  const queryClient = useQueryClient();
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

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory_items_count"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["quick-deduct-plan"] }),
    ]);
  }, [queryClient]);

  /**
   * Puts a deduction back (F5). Stock first, then the card — the reversal of the
   * write, so a failure in between leaves the stock restored and the record
   * still there to be seen rather than a record with no stock.
   */
  const undo = useCallback(
    async (
      card: RequestItem,
      snapshot: DeductSnapshot
    ): Promise<QuickUndoOutcome> => {
      const reverted = await undoStock(snapshot);
      if (!reverted.ok) {
        return { message: reverted.error.message, ok: false };
      }
      await deleteRequest(card.id);
      notifyRequestsChanged();
      await invalidate();
      toast.success("Deduction undone", {
        description: `${card.medicine} is back on the shelf — the record was removed.`,
        id: TOAST_ID,
      });
      return { ok: true };
    },
    [invalidate]
  );

  const runUndo = useCallback(
    async (card: RequestItem, snapshot: DeductSnapshot) => {
      const outcome = await undo(card, snapshot);
      if (!outcome.ok) {
        // Refused, not silent: the stock is left where it is (E7).
        toast.error("Could not undo", {
          description: outcome.message,
          id: TOAST_ID,
        });
      }
    },
    [undo]
  );

  const deduct = useCallback(
    async ({ item, qty }: QuickDeductInput): Promise<QuickDeductOutcome> => {
      const at = new Date().toISOString();
      const [id] = await reserveRequestIds(1, new Date(at));
      if (!id) {
        return { message: "Could not reserve a request reference.", ok: false };
      }
      const unit = defaultUnitForItem(item);

      // Stock first, card second: the reverse is exactly the bug this fixes.
      const result = await deductStock(
        { id, itemId: item.id, medicine: item.displayName, qty, unit },
        QUICK_DEDUCT_OPTIONS
      );
      if (!result.ok) {
        return { message: result.error.message, ok: false };
      }

      const card: RequestItem = {
        // Newest in the Claimed lane — position 0 is the top (migration 0011).
        boardPosition: 0,
        category: item.category,
        dispensingRecords: [result.record],
        history: [
          {
            at,
            by: ACTOR,
            from: null,
            note: "Quick deduction — taken from the shelf at the counter",
            to: "claimed",
          },
        ],
        id,
        itemId: item.id,
        medicine: item.displayName,
        notes: [],
        qty,
        // No requestor, no reason: the item and a quantity is the whole form
        // (D2/N6). Blank strings render as "Walk-in" and `reason` is optional
        // (companion D17/D23).
        reason: "",
        requestor: { email: "", id: "", name: "" },
        source: "quick-deduct",
        status: "claimed",
        submittedAt: at,
        unit,
      };
      try {
        await saveRequest(card);
      } catch (error) {
        // The stock is already taken, but the card would not survive a restart.
        // Surface the failure so the operator knows the record is missing.
        console.error(
          "[persistence] saveRequest failed for quick deduct",
          error
        );
        toast.error(
          "Deduction saved to shelf, but the record did not persist",
          {
            description:
              error instanceof Error
                ? error.message
                : "Restart will lose this card.",
            id: TOAST_ID,
          }
        );
        throw error;
      }
      notifyRequestsChanged();
      await invalidate();

      toast.success(`${item.displayName} — ${planSummary(result.plan)}`, {
        action: {
          label: "Undo",
          onClick: () => {
            runUndo(card, result.snapshot).catch(() => undefined);
          },
        },
        description: `${standingAfter(result.plan)}. Recorded as ${id}.`,
        duration: UNDO_WINDOW_MS,
        id: TOAST_ID,
      });

      return { card, ok: true, plan: result.plan, snapshot: result.snapshot };
    },
    [invalidate, runUndo]
  );

  const items = useMemo(
    () => dispensableItems(inventory.data ?? []),
    [inventory.data]
  );

  return {
    dbReady,
    deduct,
    isLoadingItems: inventory.isLoading,
    items,
    undo,
  } as const;
}
