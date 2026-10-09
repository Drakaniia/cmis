import { describe, expect, it } from "vitest";

import { collectRequestors } from "./requestors";
import type { RequestItem, Requestor } from "./types";

function makeItem(
  id: string,
  requestor: Requestor,
  submittedAt: string
): RequestItem {
  return {
    boardPosition: 0,
    category: "Analgesic",
    dispensingRecords: [],
    history: [],
    id,
    medicine: "Paracetamol 500mg",
    notes: [],
    qty: 2,
    reason: "",
    requestor,
    source: "queue",
    status: "pending",
    submittedAt,
    unit: "tabs",
  };
}

const EARLY = "2026-01-01T00:00:00.000Z";
const LATE = "2026-02-01T00:00:00.000Z";

describe("collectRequestors", () => {
  it("returns nothing for an empty queue", () => {
    expect(collectRequestors([])).toEqual({
      anonymousCount: 0,
      requestors: [],
    });
  });

  it("groups requests by ID and counts them", () => {
    const maria: Requestor = {
      email: "maria@bukidnon.edu",
      id: "STU-2024-0831",
      name: "Maria Santos",
    };
    const { requestors } = collectRequestors([
      makeItem("REQ-1", maria, LATE),
      makeItem("REQ-2", maria, EARLY),
    ]);

    expect(requestors).toHaveLength(1);
    expect(requestors[0]).toMatchObject({
      count: 2,
      filterValue: "STU-2024-0831",
      id: "STU-2024-0831",
      name: "Maria Santos",
    });
  });

  it("falls back to the name when there is no ID", () => {
    const { requestors } = collectRequestors([
      makeItem("REQ-1", { email: "", id: "", name: "  Ana Reyes  " }, EARLY),
    ]);

    expect(requestors[0]).toMatchObject({
      filterValue: "Ana Reyes",
      id: "",
      name: "Ana Reyes",
    });
  });

  it("treats a shared name as one requestor, case-insensitively", () => {
    const { requestors } = collectRequestors([
      makeItem("REQ-1", { email: "", id: "", name: "Ana Reyes" }, EARLY),
      makeItem("REQ-2", { email: "", id: "", name: "ana reyes" }, LATE),
    ]);

    expect(requestors).toHaveLength(1);
    expect(requestors[0].count).toBe(2);
  });

  it("keeps the newest spelling and details", () => {
    const { requestors } = collectRequestors([
      makeItem(
        "REQ-1",
        { email: "old@bukidnon.edu", id: "STU-1", name: "Ana Rayes" },
        EARLY
      ),
      makeItem(
        "REQ-2",
        { email: "ana@bukidnon.edu", id: "STU-1", name: "Ana Reyes" },
        LATE
      ),
    ]);

    expect(requestors[0]).toMatchObject({
      email: "ana@bukidnon.edu",
      lastSubmittedAt: LATE,
      name: "Ana Reyes",
    });
  });

  it("counts anonymous requests without listing them", () => {
    const { anonymousCount, requestors } = collectRequestors([
      makeItem("REQ-1", { email: "", id: "", name: "" }, EARLY),
      makeItem("REQ-2", { email: "", id: "  ", name: "   " }, LATE),
      makeItem(
        "REQ-3",
        { email: "a@b.co", id: "STU-2", name: "Ben Cruz" },
        EARLY
      ),
    ]);

    expect(anonymousCount).toBe(2);
    expect(requestors.map((entry) => entry.name)).toEqual(["Ben Cruz"]);
  });

  it("sorts by name, then ID", () => {
    const { requestors } = collectRequestors([
      makeItem("REQ-1", { email: "", id: "STU-9", name: "Zoe" }, EARLY),
      makeItem("REQ-2", { email: "", id: "STU-2", name: "Ben" }, EARLY),
      makeItem("REQ-3", { email: "", id: "STU-1", name: "Ana" }, EARLY),
      makeItem("REQ-4", { email: "", id: "STU-5", name: "Ana" }, EARLY),
    ]);

    expect(requestors.map((entry) => entry.filterValue)).toEqual([
      "STU-1",
      "STU-5",
      "STU-2",
      "STU-9",
    ]);
  });
});
