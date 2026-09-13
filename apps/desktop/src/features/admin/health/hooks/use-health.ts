import { useCallback, useEffect, useState } from "react";

import { mockHealthCards, mockPendingSyncs } from "../mock";
import type { HealthCardData, HealthCardId, PendingSync } from "../types";

export interface HealthActionResult {
  description?: string;
  message: string;
}

/**
 * CMIS-UI-09 §5 — health state. Actions are diagnostic and rare, so they update
 * a single card in place rather than navigating away.
 */
export function useHealth(
  initialCards: HealthCardData[] = mockHealthCards,
  initialSyncs: PendingSync[] = mockPendingSyncs
) {
  const [cards, setCards] = useState<HealthCardData[]>(initialCards);
  const [pendingSyncs, setPendingSyncs] = useState<PendingSync[]>(initialSyncs);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const patchCard = useCallback(
    (id: HealthCardId, patch: Partial<HealthCardData>) => {
      setCards((prev) =>
        prev.map((card) => (card.id === id ? { ...card, ...patch } : card))
      );
    },
    []
  );

  const runAction = useCallback(
    (_id: HealthCardId, actionId: string): HealthActionResult | null => {
      if (actionId === "vacuum") {
        patchCard("database", {
          caption: "Vacuumed just now",
          status: "ok",
          statusLabel: "Database healthy",
        });
        return {
          description: "SQLite VACUUM completed",
          message: "Database vacuumed",
        };
      }
      if (actionId === "integrity") {
        patchCard("database", {
          caption: "Integrity check passed",
          status: "ok",
          statusLabel: "Database healthy",
        });
        return {
          description: "PRAGMA integrity_check returned ok",
          message: "Integrity check passed",
        };
      }
      if (actionId === "clear-cache") {
        patchCard("storage", {
          caption: "Cache cleared — 0.5 GB reclaimed",
          metric: "1.6 GB / 8 GB",
          status: "ok",
          statusLabel: "Storage healthy",
        });
        return {
          description: "0.5 GB of cached renders and thumbnails removed",
          message: "Cache cleared",
        };
      }
      if (actionId === "retry-sync") {
        const count = pendingSyncs.length;
        setPendingSyncs([]);
        patchCard("sync", {
          caption: "All records synced",
          metric: "Synced",
          status: "ok",
          statusLabel: "Sync healthy",
        });
        return {
          description:
            count > 0 ? `${count} records flushed` : "Already synced",
          message: "Sync retried",
        };
      }
      if (actionId === "trigger-backup") {
        const today = new Date().toLocaleDateString("en-US", {
          day: "numeric",
          month: "short",
        });
        patchCard("backup", {
          caption: "Next: daily 02:00",
          metric: today,
          status: "ok",
          statusLabel: "Backup current",
        });
        return {
          description: "Written to appData/backups",
          message: "Backup complete",
        };
      }
      return null;
    },
    [patchCard, pendingSyncs.length]
  );

  return { cards, online, pendingSyncs, runAction } as const;
}
