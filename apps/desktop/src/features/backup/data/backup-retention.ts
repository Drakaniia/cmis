/**
 * Retention victim selection (backup-restore spec F4). Pure. Mirrors
 * `prune_victims` in `src-tauri/src/commands/backup.rs`, which is what actually
 * deletes; this is the same rule stated where it can be tested cheaply.
 */
import { backupKindOf, deviceTagOf } from "./backup-naming";

export function selectPruneVictims(
  names: readonly string[],
  keep: number,
  justWritten: string
): string[] {
  const survivors = Math.max(1, keep);
  const groups = new Map<string, string[]>();
  for (const name of names) {
    // Only automatic copies are ever candidates; a manual copy is never the
    // app's to delete.
    if (backupKindOf(name) !== "auto") {
      continue;
    }
    const tag = deviceTagOf(name) ?? "";
    const group = groups.get(tag);
    if (group) {
      group.push(name);
    } else {
      groups.set(tag, [name]);
    }
  }

  // The newest `survivors` of each device survive — retention is per device so
  // that one machine's run cannot delete another machine's only copies — and
  // `justWritten` is removed from the list afterwards, so a clock-skewed
  // outlier keeps keep+1 files rather than deleting the file just written.
  // `YYYY-MM-DD` sorts chronologically as text, so the oldest are at the front.
  const victims: string[] = [];
  for (const group of groups.values()) {
    group.sort();
    victims.push(...group.slice(0, Math.max(0, group.length - survivors)));
  }
  return victims.filter((name) => name !== justWritten);
}
