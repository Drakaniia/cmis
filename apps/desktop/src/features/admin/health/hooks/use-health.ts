import { useCallback, useEffect, useState } from "react";

import { getDb } from "@/lib/db";
import type { DbLike } from "@/features/inventory/creation/db-like";
import { runHealthAction, type HealthActionResult } from "../data/health-actions";
import type { HealthCardData, HealthCardId, PendingSync } from "../types";

/**
 * CMIS-UI-09 §5 — health state.
 *
 * Actions run real SQL via `runHealthAction` and report what actually
 * happened. They used to patch a card and report success without touching the
 * database, which on a health page is a false all-clear. The measured set
 * arrives after mount, so it is adopted onto an empty grid, and a card the
 * operator has already acted on keeps its patched state.
 */
export function useHealth(
  initialCards?: HealthCardData[],
  initialSyncs?: PendingSync[]
) {
  const [cards, setCards] = useState<HealthCardData[]>(initialCards ?? []);
  const [pendingSyncs] = useState<PendingSync[]>(initialSyncs ?? []);
  const [online] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    if (initialCards && initialCards.length > 0) {
      setCards((prev) => (prev.length === 0 ? initialCards : prev));
    }
  }, [initialCards]);

  const patchCard = useCallback(
    (id: HealthCardId, patch: Partial<HealthCardData>) => {
      setCards((prev) =>
        prev.map((card) => (card.id === id ? { ...card, ...patch } : card))
      );
    },
    []
  );

  const runAction = useCallback(
    async (
      id: HealthCardId,
      actionId: string
    ): Promise<HealthActionResult | null> => {
      const db = (await getDb()) as unknown as DbLike;
      const result = await runHealthAction({ actionId, db });
      if (!result) {
        return null;
      }
      // Only patch the card on a real success, so a failed check leaves the
      // previous reading visible instead of claiming a pass.
      if (result.ok) {
        patchCard(id, {
          caption: result.message,
          status: "ok",
          statusLabel:
            id === "database" ? "Database healthy" : "Storage healthy",
        });
      } else {
        patchCard(id, { status: "danger", statusLabel: result.message });
      }
      return result;
    },
    [patchCard]
  );

  return { cards, online, pendingSyncs, runAction } as const;
}
