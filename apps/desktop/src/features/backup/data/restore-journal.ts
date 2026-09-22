/**
 * The restore journal (backup-restore spec F10.6). Pure parse/serialize.
 *
 * `apply_restore` writes this beside the live database because the audit row
 * cannot be written before the swap — it lives in the database being
 * replaced. On the next launch, after the database opens, the pending record
 * is consumed and one `audit_log` entry lands in the *restored* database.
 */

export interface RestoreJournal {
  appVersion: string;
  at: string;
  operator: string;
  sourceFile: string;
  sourceName: string;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Parse an unknown value into a journal, or `null` when it is malformed.
 * A malformed journal is reported and deleted by the consumer — it never
 * blocks startup (spec F10.6).
 */
export function parseRestoreJournal(raw: unknown): RestoreJournal | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const { appVersion, at, operator, sourceFile, sourceName } = record;
  if (
    !(
      nonEmpty(sourceFile) &&
      nonEmpty(sourceName) &&
      nonEmpty(operator) &&
      nonEmpty(appVersion) &&
      nonEmpty(at)
    )
  ) {
    return null;
  }
  return {
    appVersion: (appVersion as string).trim(),
    at: (at as string).trim(),
    operator: (operator as string).trim(),
    sourceFile: (sourceFile as string).trim(),
    sourceName: (sourceName as string).trim(),
  };
}

export function serializeRestoreJournal(journal: RestoreJournal): string {
  return JSON.stringify(journal);
}

/** The audit sentence the consumer writes into the restored database. */
export function restoreAuditDetail(journal: RestoreJournal): string {
  return `Restored database from ${journal.sourceName}`;
}
