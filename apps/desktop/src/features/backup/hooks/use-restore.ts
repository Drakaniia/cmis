import { useEffect } from "react";
import { toast } from "sonner";
import { getOperatorName } from "@/features/admin/audit/operator";
import { recordAudit } from "@/features/admin/audit/write-audit";
import { closeDb, getDb } from "@/lib/db";
import { isTauriRuntime } from "@/lib/open-external";
import { invoke } from "@/lib/tauri";
import {
  type BackupInspection,
  CURRENT_SCHEMA_VERSION,
} from "../data/backup-inspection";
import {
  parseRestoreJournal,
  type RestoreJournal,
  restoreAuditDetail,
} from "../data/restore-journal";

async function appVersion(): Promise<string> {
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "unknown";
  }
}

/**
 * Stamp this launch's origin onto the live database (spec §9).
 *
 * `inspect_backup` reads these keys to refuse a backup made by a newer app.
 * A database from before this change reports "unknown" and is accepted
 * unless its tables are wrong. Best-effort: never fails the launch.
 */
export async function stampBackupVersion(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  try {
    const db = (await getDb()) as unknown as {
      execute: (sql: string, params?: unknown[]) => Promise<unknown>;
    };
    const version = await appVersion();
    await db.execute(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)",
      ["backup_app_version", version]
    );
    await db.execute(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)",
      ["backup_schema_version", String(CURRENT_SCHEMA_VERSION)]
    );
  } catch {
    // app_meta may not exist yet (pre-migration database) — inspection then
    // falls back to the migration ledger, so there is nothing to do here.
  }
}

export function inspectBackup(path: string): Promise<BackupInspection> {
  return invoke<BackupInspection>("inspect_backup", { path });
}

/**
 * The verified swap (spec F10.4): close the SQL connection, replace the live
 * file, and restart immediately. The caller must have run `inspectBackup`
 * first and collected the typed confirmation. Never call this on a refusal —
 * and never restart when it throws (F10.5).
 */
export async function applyRestore(sourcePath: string): Promise<never> {
  await closeDb();
  await invoke<string>("apply_restore", {
    operator: getOperatorName(),
    sourcePath,
  });
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
  // `relaunch` never returns; the throw keeps the return type honest.
  throw new Error("Restarting with the restored database…");
}

/**
 * Consume the pending restore journal once the database is open (F10.6) and
 * write the surviving audit entry into the *restored* database. A journal
 * that cannot be parsed is reported and already deleted Rust-side; it never
 * blocks startup.
 */
export async function consumeRestoreJournal(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  let journal: RestoreJournal | null = null;
  try {
    const raw = await invoke<unknown>("consume_restore_journal");
    if (raw === null || raw === undefined) {
      return;
    }
    journal = parseRestoreJournal(raw);
    if (!journal) {
      toast.warning("Restore journal was unreadable", {
        description:
          "The restored data itself is unaffected, but no audit entry was written.",
      });
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Rust deletes even an unreadable journal, so this fires once, not every
    // launch — and the restored data itself is unaffected either way.
    toast.warning("Restore journal was unreadable", { description: message });
    return;
  }
  try {
    await recordAudit(
      (await getDb()) as unknown as {
        execute: (sql: string, params?: unknown[]) => Promise<unknown>;
      },
      {
        action: "settings",
        actor: journal.operator,
        detail: restoreAuditDetail(journal),
        targetKind: "settings",
      },
      { bestEffort: true }
    );
  } catch {
    // best-effort: the restore already happened; the audit row is a record
  }
  toast.success("Database restored", { description: journal.sourceName });
}

/** True when no inventory, request, or dispensing row exists (spec F11). */
export async function isDatabaseEmpty(): Promise<boolean> {
  try {
    const db = (await getDb()) as unknown as {
      select: <T>(sql: string) => Promise<T>;
    };
    const rows = await db.select<{ n: number }[]>(
      "SELECT (SELECT COUNT(*) FROM inventory_items) + (SELECT COUNT(*) FROM requests) + (SELECT COUNT(*) FROM dispensing_events) AS n"
    );
    return (rows[0]?.n ?? 0) === 0;
  } catch {
    return false;
  }
}

/**
 * True on a genuine first run: every operational table *and* the audit log
 * are empty (spec F11). A wiped database merely looks empty — the wipe
 * deliberately preserves its audit row — so the prompt does not reappear
 * after a wipe.
 */
export async function isFirstRunDatabase(): Promise<boolean> {
  try {
    const db = (await getDb()) as unknown as {
      select: <T>(sql: string) => Promise<T>;
    };
    const rows = await db.select<{ n: number }[]>(
      "SELECT (SELECT COUNT(*) FROM inventory_items) + (SELECT COUNT(*) FROM requests) + (SELECT COUNT(*) FROM dispensing_events) + (SELECT COUNT(*) FROM audit_log) AS n"
    );
    return (rows[0]?.n ?? 0) === 0;
  } catch {
    return false;
  }
}

/**
 * Startup companion to `useDailyBackup`: stamps the version keys, then
 * consumes a pending restore journal. Mounted once at the app shell, after
 * the UI is usable — never in `beforeLoad`.
 */
export function useRestoreJournal() {
  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    let cancelled = false;
    (async () => {
      await stampBackupVersion();
      if (!cancelled) {
        await consumeRestoreJournal();
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
}
