/**
 * CMIS Cloud Sync — last-write-wins, as a pure function.
 *
 * The spec (§8) asks for timestamp-based last-write-wins with the conflicts
 * logged rather than silently dropped, and this module is the whole of that
 * decision. It touches no database, which is what makes every branch — an equal
 * timestamp, a clock that disagrees, a delete racing an edit — cheap to test
 * exhaustively (`conflict-resolver.test.ts`) instead of hoped for.
 *
 * The one rule: **the newer timestamp wins, and a tie changes nothing.** A tie
 * means the row is already exactly what the other device has, so writing it
 * again would only churn the change log. That last part is not hypothetical: the
 * pull re-reads the last few minutes on every run to be safe about equal
 * timestamps at a page boundary, so most of what arrives is a row this device
 * already holds. Refusing it is what keeps the overlap window nearly free.
 *
 * Timestamps are compared as instants, not as strings. The two shapes this
 * database contains — `2026-10-11T06:43:18.160Z` from JavaScript and
 * `2026-10-11T06:43:18Z` from SQLite's `%S` format — do not sort the same way
 * lexicographically (`.` is below `Z`), and a comparison that says the
 * millisecond-less row is *newer* than the same instant with milliseconds is a
 * comparison that would let one device's copy win for reasons no operator could
 * see.
 */

import { EPOCH } from "./schema";
import type { SyncConflict, SyncConflictResolution } from "./types";

const EPOCH_MS = Date.parse(EPOCH);

/**
 * A timestamp as a number.
 *
 * Unparseable values sort as the epoch rather than as `NaN`: every comparison
 * against `NaN` is false, so a single malformed row would otherwise be unable
 * to win *or* lose a conflict and could sit unapplied forever.
 */
export function timestampMs(value: string | null | undefined): number {
  if (value === null || value === undefined || value === "") {
    return EPOCH_MS;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? EPOCH_MS : parsed;
}

/** Strictly newer — a tie is not newer. */
export function isNewer(
  candidate: string | null | undefined,
  incumbent: string | null | undefined
): boolean {
  return timestampMs(candidate) > timestampMs(incumbent);
}

export interface IncomingDecision {
  conflict: SyncConflict | null;
  /** `true` when the incoming row should be written. */
  write: boolean;
}

/**
 * Whether an incoming row may be applied over what is already here.
 *
 * Checked in this order, and the order matters:
 *
 * 1. A local row that is newer than the incoming one wins (`row-newer`).
 * 2. A local *tombstone* that is at least as new as the incoming row wins
 *    (`deleted-newer`) — this is a delete on another device racing this
 *    device's stale copy, and applying it here would resurrect a record the
 *    clinic deliberately removed.
 *
 * A missing local row is not a conflict: it is the ordinary case of syncing a
 * record this device has never seen.
 */
export function decideIncomingRow(input: {
  incomingUpdatedAt: string | null;
  localExists: boolean;
  localUpdatedAt: string | null;
  rowKey: string;
  table: SyncConflict["table"];
  tombstoneDeletedAt?: string | null;
}): IncomingDecision {
  const { incomingUpdatedAt, localExists, localUpdatedAt, rowKey, table } =
    input;

  if (localExists && isNewer(localUpdatedAt, incomingUpdatedAt)) {
    return {
      conflict: {
        localUpdatedAt: localUpdatedAt ?? null,
        remoteUpdatedAt: incomingUpdatedAt ?? null,
        resolution: "row-newer",
        rowKey,
        table,
      },
      write: false,
    };
  }

  // A tie is not progress and not a conflict: this device's copy already carries
  // that timestamp. Two devices writing to one row in the same millisecond keep
  // their own copies until the next write to that row, which is strictly newer
  // and therefore resolves it.
  if (
    localExists &&
    timestampMs(localUpdatedAt) === timestampMs(incomingUpdatedAt)
  ) {
    return { conflict: null, write: false };
  }

  const tombstoneDeletedAt = input.tombstoneDeletedAt ?? null;
  if (
    tombstoneDeletedAt !== null &&
    isNewer(tombstoneDeletedAt, incomingUpdatedAt)
  ) {
    return {
      conflict: {
        localUpdatedAt: tombstoneDeletedAt,
        remoteUpdatedAt: incomingUpdatedAt ?? null,
        resolution: "deleted-newer",
        rowKey,
        table,
      },
      write: false,
    };
  }

  return { conflict: null, write: true };
}

/**
 * Whether an incoming delete may be applied over the local row.
 *
 * A local edit newer than the delete wins (`row-newer`, `write: false`): the
 * clinic edited the record after the other device removed it, and the edit is
 * the more recent intent. That row is then pushed back on the next sync, which
 * is what removes the server's tombstone again.
 */
export function decideIncomingDelete(input: {
  deletedAt: string;
  localExists: boolean;
  localUpdatedAt: string | null;
  rowKey: string;
  table: SyncConflict["table"];
}): IncomingDecision {
  const { deletedAt, localExists, localUpdatedAt, rowKey, table } = input;
  if (localExists && isNewer(localUpdatedAt, deletedAt)) {
    return {
      conflict: {
        localUpdatedAt: localUpdatedAt ?? null,
        remoteUpdatedAt: deletedAt,
        resolution: "row-newer",
        rowKey,
        table,
      },
      write: false,
    };
  }
  // A delete that lands where the row is older (or absent) is not a conflict,
  // it is the ordinary case — logging it would fill the audit trail with the
  // routine and bury the rows that actually need a human.
  return { conflict: null, write: localExists };
}

/** One line for the audit log, so a resolved conflict is not silent. */
export function describeConflict(conflict: SyncConflict): string {
  const outcome: Record<SyncConflictResolution, string> = {
    "deleted-newer":
      "kept the local delete — the record stays removed on this device",
    "remote-newer": "took the cloud copy",
    "row-newer": "kept the local copy — it is newer than the cloud version",
  };
  return `Sync conflict on ${conflict.table} ${conflict.rowKey}: ${outcome[conflict.resolution]}`;
}
