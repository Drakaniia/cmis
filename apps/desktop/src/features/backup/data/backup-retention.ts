/** Retention victim selection (backup-restore spec F4). Pure. */
import { isAutoBackupName } from "./backup-naming";

export function selectPruneVictims(
  names: readonly string[],
  keep: number,
  justWritten: string
): string[] {
  // `justWritten` counts toward the survivors (it is today's file, so it is
  // normally among the newest) but is never itself a victim: the filter runs
  // after the cut, so a clock-skewed outlier keeps keep+1 files rather than
  // deleting the file just written.
  const all = names.filter((name) => isAutoBackupName(name)).sort();
  const survivors = Math.max(1, keep);
  return all
    .slice(0, Math.max(0, all.length - survivors))
    .filter((name) => name !== justWritten);
}
