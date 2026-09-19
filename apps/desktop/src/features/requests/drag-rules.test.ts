import { describe, expect, it } from "vitest";

import {
  columnInDirection,
  hiddenFromBoard,
  illegalLanesFor,
  laneEligibility,
  refusalAnnouncement,
  refusalFor,
  refusalToastId,
  resequence,
} from "./drag-rules";
import { canMove, STATUS_ORDER } from "./transitions";
import type { RequestItem, RequestStatus } from "./types";

const HOUR_MS = 3_600_000;

function requestedAt(hoursAgo: number, now: number): string {
  return new Date(now - hoursAgo * HOUR_MS).toISOString();
}

function makeItem(overrides: Partial<RequestItem> = {}): RequestItem {
  return {
    boardPosition: 0,
    category: "Analgesic",
    dispensingRecords: [],
    history: [],
    id: "REQ-2026-0001",
    medicine: "Paracetamol 500mg",
    notes: [],
    qty: 2,
    reason: "test",
    requestor: { email: "a@b.c", id: "STU-1", name: "Test Viewer" },
    source: "queue",
    status: "pending",
    submittedAt: requestedAt(1, Date.now()),
    unit: "tabs",
    ...overrides,
  };
}

/** Every pair the transition table forbids (same-lane reorders are legal). */
const FORBIDDEN_PAIRS: [RequestStatus, RequestStatus][] = [];
for (const from of STATUS_ORDER) {
  for (const to of STATUS_ORDER) {
    if (from !== to && !canMove(from, to)) {
      FORBIDDEN_PAIRS.push([from, to]);
    }
  }
}

describe("laneEligibility", () => {
  it("treats a reorder inside the same lane as legal", () => {
    for (const status of STATUS_ORDER) {
      expect(laneEligibility(status, status)).toBe("legal");
    }
  });

  it("mirrors the transition table between lanes", () => {
    for (const from of STATUS_ORDER) {
      for (const to of STATUS_ORDER) {
        if (from === to) {
          continue;
        }
        expect(laneEligibility(from, to)).toBe(
          canMove(from, to) ? "legal" : "illegal"
        );
      }
    }
  });

  it("lists every lane a Claimed card cannot go to", () => {
    const illegal = illegalLanesFor(
      "claimed",
      STATUS_ORDER.filter((status) => status !== "claimed")
    );
    expect(illegal).toEqual(["pending", "approved", "ready", "denied"]);
  });
});

describe("refusalFor", () => {
  it("says nothing about a legal move", () => {
    expect(refusalFor("pending", "approved")).toBeNull();
    expect(refusalFor("ready", "claimed")).toBeNull();
    expect(refusalFor("denied", "pending")).toBeNull();
    expect(refusalFor("claimed", "claimed")).toBeNull();
  });

  it("has copy for every forbidden pair in the transition table", () => {
    expect(FORBIDDEN_PAIRS.length).toBeGreaterThan(0);
    for (const [from, to] of FORBIDDEN_PAIRS) {
      const refusal = refusalFor(from, to);
      expect(refusal, `${from} → ${to}`).not.toBeNull();
      expect(refusal?.message.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("only ever offers a legal, adjacent move or a read-only view", () => {
    for (const [from, to] of FORBIDDEN_PAIRS) {
      const action = refusalFor(from, to)?.action;
      if (!action) {
        continue;
      }
      if (action.id === "view-dispensing-record") {
        expect(action.to).toBeUndefined();
        continue;
      }
      expect(action.to, `${from} → ${to}`).toBeDefined();
      expect(canMove(from, action.to as RequestStatus)).toBe(true);
    }
  });

  it("id is per destination lane, so repeats replace rather than stack", () => {
    for (const [from, to] of FORBIDDEN_PAIRS) {
      expect(refusalFor(from, to)?.toastId).toBe(refusalToastId(to));
    }
    expect(refusalToastId("ready")).not.toBe(refusalToastId("denied"));
    expect(refusalToastId("ready")).toBe("request-refusal-ready");
  });

  it("names the rule and the legal path for a Claimed card", () => {
    const refusal = refusalFor("claimed", "ready");
    expect(refusal?.message).toContain("Dispensing Log");
    expect(refusal?.action?.label).toBe("View dispensing record");
    expect(refusal?.action?.to).toBeUndefined();
  });

  it("sends a denied card back to Pending first", () => {
    for (const to of ["approved", "ready", "claimed"] as RequestStatus[]) {
      const refusal = refusalFor("denied", to);
      expect(refusal?.action?.label).toBe("Re-open → Pending");
      expect(refusal?.action?.to).toBe("pending");
    }
  });

  it("offers the adjacent prepared step for a pending or approved card", () => {
    expect(refusalFor("pending", "claimed")?.action?.label).toBe("Approve");
    expect(refusalFor("approved", "claimed")?.action?.to).toBe("ready");
  });

  it("sends a Ready card back through Approved", () => {
    expect(refusalFor("ready", "pending")?.action?.to).toBe("approved");
    expect(refusalFor("ready", "denied")?.action?.to).toBe("approved");
  });

  it("spells the refusal out with both lane names", () => {
    const refusal = refusalFor("claimed", "ready");
    expect(refusal).not.toBeNull();
    const announcement = refusalAnnouncement(
      "claimed",
      "ready",
      refusal as NonNullable<ReturnType<typeof refusalFor>>
    );
    expect(announcement).toContain(
      "Cannot move to Ready to Claim from Claimed."
    );
  });
});

describe("columnInDirection", () => {
  it("names the neighbouring column on either side", () => {
    expect(columnInDirection("pending", 1, STATUS_ORDER)).toBe("approved");
    expect(columnInDirection("approved", -1, STATUS_ORDER)).toBe("pending");
    expect(columnInDirection("denied", -1, STATUS_ORDER)).toBe("claimed");
  });

  it("returns null past the ends of the board", () => {
    expect(columnInDirection("pending", -1, STATUS_ORDER)).toBeNull();
    expect(columnInDirection("denied", 1, STATUS_ORDER)).toBeNull();
  });
});

describe("resequence", () => {
  it("numbers a lane from zero in the order given", () => {
    expect(resequence([{ id: "a" }, { id: "b" }, { id: "c" }])).toEqual([
      { id: "a", position: 0 },
      { id: "b", position: 1 },
      { id: "c", position: 2 },
    ]);
  });

  it("returns nothing for an empty lane", () => {
    expect(resequence([])).toEqual([]);
  });
});

describe("hiddenFromBoard", () => {
  const now = Date.now();

  it("hides an explicitly archived row", () => {
    expect(
      hiddenFromBoard(
        makeItem({ archivedAt: new Date(now).toISOString() }),
        now
      )
    ).toBe(true);
  });

  it("falls back to the derived 24h rule for Claimed cards", () => {
    const claimed = (hoursAgo: number) =>
      makeItem({
        history: [
          {
            at: requestedAt(hoursAgo, now),
            by: "You",
            from: "ready",
            to: "claimed",
          },
        ],
        status: "claimed",
      });
    expect(hiddenFromBoard(claimed(25), now)).toBe(true);
    expect(hiddenFromBoard(claimed(1), now)).toBe(false);
  });

  it("leaves an ordinary card on the board", () => {
    expect(hiddenFromBoard(makeItem(), now)).toBe(false);
  });
});
