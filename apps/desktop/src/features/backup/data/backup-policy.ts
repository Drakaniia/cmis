/** Once-per-day launch decision (backup-restore spec F1). Pure. */
export interface DailyBackupInput {
  enabled: boolean;
  hasDatabase: boolean;
  lastBackupDate: string;
  today: string;
}

export interface DailyBackupDecision {
  reason: "already-done" | "disabled" | "due" | "no-database";
  run: boolean;
}

export function shouldRunDailyBackup(
  input: DailyBackupInput,
): DailyBackupDecision {
  if (!input.enabled) {
    return { reason: "disabled", run: false };
  }
  if (!input.hasDatabase) {
    return { reason: "no-database", run: false };
  }
  if (input.lastBackupDate === input.today) {
    return { reason: "already-done", run: false };
  }
  return { reason: "due", run: true };
}
