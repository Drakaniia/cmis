import { describe, expect, it } from "vitest";

import {
  decideIncomingDelete,
  decideIncomingRow,
  describeConflict,
  isNewer,
  timestampMs,
} from "./conflict-resolver";

const T = (iso: string) => iso;

describe("timestamp comparison", () => {
  it("compares instants, not strings", () => {
    // SQLite's `%S` format drops the milliseconds, and `.` sorts below `Z` — a
    // string comparison would call the same instant newer.
    expect(timestampMs("2026-10-11T06:43:18Z")).toBe(
      timestampMs("2026-10-11T06:43:18.000Z")
    );
    expect(isNewer("2026-10-11T06:43:18.500Z", "2026-10-11T06:43:18Z")).toBe(
      true
    );
  });

  it("treats a missing or unreadable timestamp as the epoch", () => {
    expect(timestampMs(null)).toBe(timestampMs("1970-01-01T00:00:00.000Z"));
    expect(timestampMs("")).toBe(timestampMs(null));
    expect(timestampMs("not a date")).toBe(timestampMs(null));
    expect(isNewer("2026-01-01T00:00:00.000Z", "not a date")).toBe(true);
  });

  it("is strictly newer: a tie is not newer", () => {
    expect(
      isNewer(T("2026-10-11T06:43:18.000Z"), T("2026-10-11T06:43:18.000Z"))
    ).toBe(false);
  });
});

describe("an incoming row", () => {
  const base = {
    incomingUpdatedAt: "2026-10-11T10:00:00.000Z",
    rowKey: "item-1",
    table: "inventory_items" as const,
  };

  it("is written when this device has never seen it", () => {
    expect(
      decideIncomingRow({ ...base, localExists: false, localUpdatedAt: null })
    ).toEqual({ conflict: null, write: true });
  });

  it("is written when it is newer than the local copy", () => {
    expect(
      decideIncomingRow({
        ...base,
        localExists: true,
        localUpdatedAt: "2026-10-11T09:00:00.000Z",
      })
    ).toEqual({ conflict: null, write: true });
  });

  it("is refused, with a conflict, when the local copy is newer", () => {
    const decision = decideIncomingRow({
      ...base,
      localExists: true,
      localUpdatedAt: "2026-10-11T11:00:00.000Z",
    });
    expect(decision.write).toBe(false);
    expect(decision.conflict).toEqual({
      localUpdatedAt: "2026-10-11T11:00:00.000Z",
      remoteUpdatedAt: "2026-10-11T10:00:00.000Z",
      resolution: "row-newer",
      rowKey: "item-1",
      table: "inventory_items",
    });
  });

  it("is refused silently on a tie — the overlap window re-sends these constantly", () => {
    expect(
      decideIncomingRow({
        ...base,
        localExists: true,
        localUpdatedAt: base.incomingUpdatedAt,
      })
    ).toEqual({ conflict: null, write: false });
  });

  it("loses to a newer local delete", () => {
    const decision = decideIncomingRow({
      ...base,
      localExists: false,
      localUpdatedAt: null,
      tombstoneDeletedAt: "2026-10-11T12:00:00.000Z",
    });
    expect(decision.write).toBe(false);
    expect(decision.conflict?.resolution).toBe("deleted-newer");
  });

  it("beats a local delete that is older than the row", () => {
    expect(
      decideIncomingRow({
        ...base,
        localExists: false,
        localUpdatedAt: null,
        tombstoneDeletedAt: "2026-10-11T09:00:00.000Z",
      })
    ).toEqual({ conflict: null, write: true });
  });
});

describe("an incoming delete", () => {
  const base = {
    deletedAt: "2026-10-11T12:00:00.000Z",
    rowKey: "item-1",
    table: "inventory_items" as const,
  };

  it("removes an older local row, without calling it a conflict", () => {
    expect(
      decideIncomingDelete({
        ...base,
        localExists: true,
        localUpdatedAt: "2026-10-11T09:00:00.000Z",
      })
    ).toEqual({ conflict: null, write: true });
  });

  it("is a no-op where the row is already gone", () => {
    expect(
      decideIncomingDelete({
        ...base,
        localExists: false,
        localUpdatedAt: null,
      })
    ).toEqual({ conflict: null, write: false });
  });

  it("loses to a newer local edit — the edit is the more recent intent", () => {
    const decision = decideIncomingDelete({
      ...base,
      localExists: true,
      localUpdatedAt: "2026-10-11T13:00:00.000Z",
    });
    expect(decision.write).toBe(false);
    expect(decision.conflict?.resolution).toBe("row-newer");
  });
});

describe("describeConflict", () => {
  it("says what happened in words an operator can read", () => {
    expect(
      describeConflict({
        localUpdatedAt: null,
        remoteUpdatedAt: null,
        resolution: "deleted-newer",
        rowKey: "req-1",
        table: "requests",
      })
    ).toContain("requests");
    expect(
      describeConflict({
        localUpdatedAt: null,
        remoteUpdatedAt: null,
        resolution: "row-newer",
        rowKey: "req-1",
        table: "requests",
      })
    ).toContain("kept the local copy");
  });
});
