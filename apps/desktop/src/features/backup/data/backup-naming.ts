/**
 * Backup file naming (backup-restore spec F3). Pure — no Tauri, no React.
 *
 * Automatic names carry the tag of the device that wrote them, because
 * `<Documents>/CMIS Backups` can be a folder two machines share:
 *
 * - `cmis-auto-YYYY-MM-DD-<device>.db` — the day's copy from one machine.
 * - `cmis-auto-YYYY-MM-DD.db` — the same, from a build that predates device
 *   tags. Still listed and still restorable, never adopted as another machine's
 *   copy of today and never pruned on a machine's say-so.
 */

export type BackupKind = "auto" | "manual" | "other";

const AUTO_RE = /^cmis-auto-\d{4}-\d{2}-\d{2}(?:-[a-z0-9][a-z0-9-]*)?\.db$/;
const AUTO_DEVICE_RE = /^cmis-auto-\d{4}-\d{2}-\d{2}-([a-z0-9][a-z0-9-]*)\.db$/;
const MANUAL_RE = /^cmis-manual-\d{4}-\d{2}-\d{2}-\d{4}(-\d+)?\.db$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local `YYYY-MM-DD` — the once-per-day key (§7.1), never UTC. */
export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * `cmis-auto-YYYY-MM-DD-<device>.db` — one per device per day.
 *
 * An empty tag produces the untagged name, which is what a build without a
 * device record would still write; the caller passes `loadDeviceTag()`.
 */
export function autoBackupName(dateKey: string, deviceTag = ""): string {
  return deviceTag
    ? `cmis-auto-${dateKey}-${deviceTag}.db`
    : `cmis-auto-${dateKey}.db`;
}

/** `cmis-manual-YYYY-MM-DD-HHmm.db` — local time, to the minute. */
export function manualBackupName(now: Date = new Date()): string {
  return `cmis-manual-${localDateKey(now)}-${pad(now.getHours())}${pad(now.getMinutes())}.db`;
}

/** In-progress copy path — renamed into place only on success. */
export function partialName(name: string): string {
  return `${name}.partial`;
}

/**
 * The device tag in an automatic copy's name, `null` when it carries none
 * (written before tags existed, or by a build that has none).
 */
export function deviceTagOf(name: string): string | null {
  return AUTO_DEVICE_RE.exec(name)?.[1] ?? null;
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
