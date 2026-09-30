/**
 * Health actions that actually do the thing they name.
 *
 * Every action here used to patch a React card and report success without
 * touching the database: "Integrity check passed" was printed without asking
 * SQLite anything, "Vacuum" printed without running VACUUM, "Clear cache"
 * deleted nothing, and "Retry sync" cleared an array that was always empty and
 * said so. On a health page that is worse than a missing feature — it is a
 * false all-clear on the one screen an operator opens when they suspect
 * something is wrong.
 *
 * So each action runs real SQL and reports what really happened. A "Clear
 * cache" button with nothing behind it is removed rather than faked.
 */

import type { DbLike } from "@/features/inventory/creation/db-like";

export interface HealthActionResult {
  description?: string;
  message: string;
  ok: boolean;
}

/**
 * The Sync card's copy. There is no queue: writes go straight to a local
 * SQLite file, so there is nothing to buffer and nothing to lose to a dropped
 * connection. The card says so rather than implying a pending-sync pipeline.
 */
export const syncCardCopy = {
  caption:
    "Local-only — every change is written straight to the database on this device",
  metric: "On device",
  statusLabel: "Writes direct",
  title: "Storage mode",
} as const;

export async function runHealthAction({
  actionId,
  db,
}: {
  actionId: string;
  db: DbLike;
}): Promise<HealthActionResult | null> {
  if (actionId === "integrity") {
    try {
      const rows = (await db.select<{ integrity_check: string }[]>(
        "PRAGMA integrity_check"
      )) as unknown as { integrity_check: string }[];
      const healthy =
        rows.length === 1 && rows[0]?.integrity_check?.toLowerCase() === "ok";
      return healthy
        ? {
            description: "PRAGMA integrity_check returned ok",
            message: "Integrity check passed",
            ok: true,
          }
        : {
            description:
              "SQLite reported a problem. Restore a backup from Settings → Backup before continuing.",
            message: "Integrity check failed",
            ok: false,
          };
    } catch (error) {
      return {
        description: error instanceof Error ? error.message : String(error),
        message: "Integrity check failed",
        ok: false,
      };
    }
  }

  if (actionId === "vacuum") {
    try {
      await db.execute("VACUUM");
      return {
        description: "VACUUM completed and free pages were reclaimed",
        message: "Database vacuumed",
        ok: true,
      };
    } catch (error) {
      return {
        description: error instanceof Error ? error.message : String(error),
        message: "Vacuum failed",
        ok: false,
      };
    }
  }

  // `clear-cache` and `retry-sync` deliberately return null. There is no cache
  // to clear and no queue to retry, so the buttons are removed from the cards
  // rather than left behind reporting a success that never happened.
  return null;
}
