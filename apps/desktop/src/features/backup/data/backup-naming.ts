/** Backup file naming (backup-restore spec F3). Pure — no Tauri, no React. */

export type BackupKind = "auto" | "manual" | "other";

const AUTO_RE = /^cmis-auto-\d{4}-\d{2}-\d{2}\.db$/;
const MANUAL_RE = /^cmis-manual-\d{4}-\d{2}-\d{2}-\d{4}(-\d+)?\.db$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local `YYYY-MM-DD` — the once-per-day key (§7.1), never UTC. */
export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `cmis-auto-YYYY-MM-DD.db` — one per day. */
export function autoBackupName(dateKey: string): string {
  return `cmis-auto-${dateKey}.db`;
}

/** `cmis-manual-YYYY-MM-DD-HHmm.db` — local time, to the minute. */
export function manualBackupName(now: Date = new Date()): string {
  return `cmis-manual-${localDateKey(now)}-${pad(now.getHours())}${pad(now.getMinutes())}.db`;
}

/** In-progress copy path — renamed into place only on success. */
export function partialName(name: string): string {
  return `${name}.partial`;
}

export function backupKindOf(name: string): BackupKind {
  if (AUTO_RE.test(name)) {
    return "auto";
  }
  if (MANUAL_RE.test(name)) {
    return "manual";
  }
  return "other";
}

export function isAutoBackupName(name: string): boolean {
  return backupKindOf(name) === "auto";
}

export function isListableBackupName(name: string): boolean {
  return backupKindOf(name) !== "other";
}

/** Append `-2`, `-3`, … before `.db` until the name is unused. */
export function resolveCollision(
  existing: readonly string[],
  base: string
): string {
  if (!existing.includes(base)) {
    return base;
  }
  const dot = base.lastIndexOf(".db");
  const stem = dot === -1 ? base : base.slice(0, dot);
  let n = 2;
  while (existing.includes(`${stem}-${n}.db`)) {
    n += 1;
  }
  return `${stem}-${n}.db`;
}
