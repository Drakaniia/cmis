import { describe, expect, it } from "vitest";

import type { RequestItem, RequestStatus } from "../types";
import { REQUEST_COLUMNS } from "../types";
import type { RequestColumnGroup } from "./board-preview";
import { previewGroupsFor } from "./board-preview";

function makeItem(id: string, status: RequestStatus): RequestItem {
  return {
    boardPosition: 0,
    category: "Analgesic",
    dispensingRecords: [],
    history: [],
    id,
    medicine: "Paracetamol 500mg",
    notes: [],
    qty: 2,
    reason: "test",
    requestor: { email: "a@b.c", id: "STU-1", name: "Test Viewer" },
    source: "queue",
    status,
    submittedAt: new Date().toISOString(),
    unit: "tabs",
  };
}

/** The committed board every expectation is derived from. */
function board(): RequestColumnGroup[] {
  const items = [
    makeItem("A", "pending"),
    makeItem("B", "pending"),
    makeItem("C", "pending"),
    makeItem("X", "approved"),
    makeItem("Y", "approved"),
  ];
  return REQUEST_COLUMNS.map((column) => {
    const lane = items.filter((item) => item.status === column.status);
    return { column, count: lane.length, items: lane, total: lane.length };
  });
}

function ids(groups: RequestColumnGroup[], status: RequestStatus): string[] {
  return (
    groups
      .find((group) => group.column.status === status)
      ?.items.map((item) => item.id) ?? []
  );
}

describe("previewGroupsFor", () => {
  it("leaves the board untouched without a card in flight", () => {
    const groups = board();
    expect(previewGroupsFor(groups, null, "approved", 0)).toBe(groups);
  });

  it("leaves the board untouched when nothing is under the pointer", () => {
    const groups = board();
    expect(previewGroupsFor(groups, "A", null, null)).toBe(groups);
  });

  it("slides the ghost to a new index inside its own lane", () => {
    const groups = previewGroupsFor(board(), "A", "pending", 2);
    expect(ids(groups, "pending")).toEqual(["B", "C", "A"]);
    // Nothing crossed lanes, so the other lane is untouched.
    expect(ids(groups, "approved")).toEqual(["X", "Y"]);
  });

  it("moves the ghost into another lane and collapses its origin", () => {
    const groups = previewGroupsFor(board(), "A", "approved", 1);
    expect(ids(groups, "pending")).toEqual(["B", "C"]);
    expect(ids(groups, "approved")).toEqual(["X", "A", "Y"]);
  });

  it("dresses the ghost in the destination status", () => {
    const groups = previewGroupsFor(board(), "A", "approved", 0);
    const ghost = groups
      .find((group) => group.column.status === "approved")
      ?.items.find((item) => item.id === "A");
    expect(ghost?.status).toBe("approved");
  });

  it("clamps an index past the end to the last slot", () => {
    const groups = previewGroupsFor(board(), "A", "approved", 99);
    expect(ids(groups, "approved")).toEqual(["X", "Y", "A"]);
  });

  it("clamps a negative index to the first slot", () => {
    const groups = previewGroupsFor(board(), "Y", "pending", -5);
    expect(ids(groups, "pending")).toEqual(["Y", "A", "B", "C"]);
  });

  it("keeps the committed counts while the order previews", () => {
    const groups = previewGroupsFor(board(), "A", "approved", 0);
    expect(
      groups.find((group) => group.column.status === "pending")?.count
    ).toBe(3);
    expect(
      groups.find((group) => group.column.status === "approved")?.count
    ).toBe(2);
  });

  it("ignores an id that is not on the board", () => {
    const groups = board();
    expect(previewGroupsFor(groups, "MISSING", "approved", 0)).toBe(groups);
  });
});
