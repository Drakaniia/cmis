import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  type DeductPlanResult,
  deductStock,
  planDeduction,
} from "../deduct-stock";
import { notifyRequestsChanged } from "../persistence";
import type { RequestItem } from "../types";
import type { DispenseOutcome } from "./use-request-board";

/** The minimum a hand-over needs — a card, or a draft row on the way in. */
export interface DispensableRequest {
  medicine: string;
  qty: number;
  unit: string;
}

export interface DispenseAttempt {
  error?: string;
  id: string;
  medicine: string;
  ok: boolean;
  outcome?: DispenseOutcome;
}

function planKey(request: DispensableRequest) {
  return [
    "dispense-plan",
    request.medicine,
    request.qty,
    request.unit,
  ] as const;
}

/**
 * The read-only plan one confirmation shows. Keyed on the medicine and the
 * outstanding quantity, so a partial hand-over that reduces `qty` re-plans
 * against the shelf as it is now.
 */
export function useDispensePlan(
  request: DispensableRequest | null,
  enabled: boolean
) {
  return useQuery({
    enabled: enabled && request !== null,
    queryFn: (): Promise<DeductPlanResult> => {
      if (!request) {
        return Promise.resolve({
          error: { code: "no-inventory-item", message: "No request selected." },
          ok: false,
        });
      }
      return planDeduction(request.medicine, request.qty, request.unit);
    },
    queryKey: request ? planKey(request) : ["dispense-plan", "none", 0, ""],
    retry: false,
    staleTime: 0,
  });
}

/** The same plan, for the whole batch selection (F9). */
export function useDispensePlans(
  requests: DispensableRequest[],
  enabled: boolean
): DeductPlanResult[] {
  const results = useQueries({
    queries: requests.map((request) => ({
      enabled,
      queryFn: (): Promise<DeductPlanResult> =>
        planDeduction(request.medicine, request.qty, request.unit),
      queryKey: planKey(request),
      retry: false,
      staleTime: 0,
    })),
  });
  return results.map((result) =>
    result.data
      ? result.data
      : {
          error: { code: "no-batch" as const, message: "Checking stock…" },
          ok: false as const,
        }
  );
}

/**
 * Runs the deduction for one or more requests and refreshes the screens that
 * read stock. Each hand-over is sequential: the second request for the same
 * medicine must read the shelf *after* the first committed, so it becomes a
 * partial rather than deducting below zero (E5).
 *
 * Failures are per request, never all-or-nothing: a mixed batch dispenses what
 * it can and names what it could not (F9).
 *
 * A committed hand-over also announces itself through `notifyRequestsChanged`:
 * the movement is now on disk in `dispensing_records`, so the Dispensing Log
 * re-reads it instead of showing a log that is missing the hand-over the
 * operator just made.
 */
export function useDispense() {
  const queryClient = useQueryClient();

  return useCallback(
    async (items: RequestItem[]): Promise<DispenseAttempt[]> => {
      const attempts: DispenseAttempt[] = [];
      for (const item of items) {
        // biome-ignore lint/performance/noAwaitInLoops: hand-overs must commit in sequence (E5)
        const result = await deductStock({
          id: item.id,
          medicine: item.medicine,
          qty: item.qty,
          unit: item.unit,
        });
        attempts.push(
          result.ok
            ? {
                id: item.id,
                medicine: item.medicine,
                ok: true,
                outcome: {
                  record: result.record,
                  remainingQty: result.plan.remaining,
                },
              }
            : {
                error: result.error.message,
                id: item.id,
                medicine: item.medicine,
                ok: false,
              }
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory_items"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory_items_count"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      ]);
      if (attempts.some((attempt) => attempt.ok)) {
        notifyRequestsChanged();
      }
      return attempts;
    },
    [queryClient]
  );
}
