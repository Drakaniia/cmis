import { describe, expect, it } from "vitest";

import {
  batchActions,
  canMove,
  isArchivedClaimed,
  requestActions,
  STATUS_ORDER,
} from "./transitions";
import type { RequestItem, RequestStatus, StatusHistoryEntry } from "./types";

const HOUR_MS = 3_600_000;

function claimHistory(at: string): StatusHistoryEntry[] {
  return [
    { at, by: "Viewer", from: null, to: "pending" },
    { at, by: "You", from: "pending", to: "approved" },
    { at, by: "You", from: "approved", to: "ready" },
    { at, by: "You", from: "ready", to: "claimed" },
  ];
}

function claimedItem(claimedHoursAgo: number, now: number): RequestItem {
  return {
    boardPosition: 0,
    category: "Analgesic",
    dispensingRecords: [],
    history: claimHistory(
      new Date(now - claimedHoursAgo * HOUR_MS).toISOString()
    ),
    id: "REQ-test",
    medicine: "Paracetamol 500mg",
    notes: [],
    qty: 2,
    reason: "test",
    requestor: { email: "a@b.c", id: "STU-1", name: "Test Viewer" },
    source: "queue",
    status: "claimed",
    submittedAt: new Date(now - 6 * HOUR_MS).toISOString(),
    unit: "tabs",
  };
}

describe("canMove", () => {
  it("allows free movement between adjacent flow columns", () => {
    expect(canMove("pending", "approved")).toBe(true);
    expect(canMove("approved", "pending")).toBe(true);
    expect(canMove("pending", "ready")).toBe(true);
    expect(canMove("approved", "ready")).toBe(true);
    expect(canMove("ready", "approved")).toBe(true);
    expect(canMove("ready", "claimed")).toBe(true);
  });

  it("enforces the three forbidden transitions", () => {
    expect(canMove("claimed", "denied")).toBe(false);
    expect(canMove("claimed", "pending")).toBe(false);
    expect(canMove("denied", "claimed")).toBe(false);
  });

  it("treats Claimed as terminal and re-opens Denied only to Pending", () => {
    expect(canMove("claimed", "approved")).toBe(false);
    expect(canMove("claimed", "ready")).toBe(false);
    expect(canMove("denied", "pending")).toBe(true);
    expect(canMove("denied", "approved")).toBe(false);
  });
});

describe("requestActions", () => {
  it("never offers a move the guards forbid", () => {
    for (const status of STATUS_ORDER) {
      for (const action of requestActions(status)) {
        if (action.to) {
          expect({
            action: action.id,
            ok: canMove(status, action.to),
            status,
          }).toEqual({
            action: action.id,
            ok: true,
            status,
          });
        }
      }
    }
  });

  it("offers only view actions once a request is claimed", () => {
    expect(requestActions("claimed").map((action) => action.id)).toEqual([
      "view",
      "view-dispensing-record",
    ]);
  });

  it("marks Deny destructive and lists it first among view actions", () => {
    const actions = requestActions("pending");
    expect(actions[0].id).toBe("view");
    expect(actions.find((action) => action.id === "deny")?.destructive).toBe(
      true
    );
  });
});

describe("batchActions", () => {
  it("gives column-aware actions for a single-status selection", () => {
    expect(batchActions(["pending"]).map((action) => action.id)).toEqual([
      "approve-all",
      "deny-all",
    ]);
    expect(batchActions(["approved"]).map((action) => action.id)).toEqual([
      "prepare-all",
      "move-all-pending",
      "deny-all",
    ]);
    expect(batchActions(["ready"]).map((action) => action.id)).toEqual([
      "dispense-all",
      "move-all-approved",
    ]);
  });

  it("collapses a mixed selection to Deny plus clear", () => {
    expect(
      batchActions(["pending", "approved"]).map((action) => action.id)
    ).toEqual(["deny-all"]);
    expect(
      batchActions(["ready", "claimed"]).map((action) => action.id)
    ).toEqual([]);
  });

  it("offers nothing structural for claimed or denied selections", () => {
    expect(batchActions(["claimed"])).toEqual([]);
    expect(batchActions(["denied"])).toEqual([]);
    expect(batchActions([])).toEqual([]);
  });

  it("only emits transitions that are legal for every selected status", () => {
    const selections: RequestStatus[][] = [
      ["pending"],
      ["approved"],
      ["ready"],
      ["pending", "approved"],
      ["ready", "claimed"],
    ];
    for (const selection of selections) {
      for (const action of batchActions(selection)) {
        for (const status of selection) {
          expect({
            action: action.id,
            ok: canMove(status, action.to),
            status,
          }).toEqual({ action: action.id, ok: true, status });
        }
      }
    }
  });
});

describe("isArchivedClaimed", () => {
  const now = Date.now();

  it("archives claimed requests after 24h", () => {
    expect(isArchivedClaimed(claimedItem(25, now), now)).toBe(true);
  });

  it("keeps recently claimed requests on the board", () => {
    expect(isArchivedClaimed(claimedItem(1, now), now)).toBe(false);
  });

  it("never archives a non-claimed request", () => {
    const item = claimedItem(30, now);
    expect(isArchivedClaimed({ ...item, status: "ready" }, now)).toBe(false);
  });
});
