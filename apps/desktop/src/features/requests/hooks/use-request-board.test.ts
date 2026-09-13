import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RequestItem } from "../types";
import { useRequestBoard } from "./use-request-board";

function makeItem(overrides: Partial<RequestItem> = {}): RequestItem {
  return {
    category: "Analgesic",
    history: [],
    id: "REQ-2026-0001",
    medicine: "Paracetamol 500mg",
    notes: [],
    qty: 2,
    reason: "Headache after PE class.",
    requestor: {
      email: "maria.santos@bukidnon.edu",
      id: "STU-2024-0831",
      name: "Maria Santos",
    },
    status: "pending",
    submittedAt: new Date(Date.now() - 60_000).toISOString(),
    unit: "tabs",
    ...overrides,
  };
}

const ITEMS: RequestItem[] = [
  makeItem({ id: "REQ-001", status: "pending" }),
  makeItem({
    id: "REQ-002",
    medicine: "Ibuprofen 400mg",
    status: "pending",
  }),
  makeItem({ id: "REQ-003", status: "approved" }),
  makeItem({
    id: "REQ-004",
    medicine: "Amoxicillin 500mg",
    status: "ready",
  }),
  makeItem({
    id: "REQ-005",
    medicine: "Cetirizine 10mg",
    status: "claimed",
    submittedAt: new Date(Date.now() - 300_000).toISOString(),
  }),
  makeItem({
    id: "REQ-006",
    medicine: "Cotrimoxazole 480mg",
    status: "denied",
  }),
];

describe("useRequestBoard", () => {
  describe("initial state", () => {
    it("starts with the provided items", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      expect(result.current.items).toHaveLength(ITEMS.length);
    });

    it("starts with no selected items", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.selectedItems).toHaveLength(0);
    });
  });

  describe("moveRequestAt", () => {
    it("moves a pending request to approved", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let outcome: ReturnType<typeof result.current.moveRequestAt> | undefined;
      act(() => {
        outcome = result.current.moveRequestAt("REQ-001", "approved", 0);
      });
      expect(outcome?.ok).toBe(true);
      if (outcome?.ok) {
        expect(outcome?.item.status).toBe("approved");
      }
    });

    it("rejects a forbidden transition (claimed → denied)", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let outcome: ReturnType<typeof result.current.moveRequestAt> | undefined;
      act(() => {
        outcome = result.current.moveRequestAt("REQ-005", "denied", 0);
      });
      expect(outcome?.ok).toBe(false);
    });

    it("rejects a forbidden transition (denied → claimed)", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let outcome: ReturnType<typeof result.current.moveRequestAt> | undefined;
      act(() => {
        outcome = result.current.moveRequestAt("REQ-006", "claimed", 0);
      });
      expect(outcome?.ok).toBe(false);
    });

    it("records history entry on move", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      act(() => {
        result.current.moveRequestAt("REQ-001", "approved", 0);
      });
      const moved = result.current.items.find((item) => item.id === "REQ-001");
      expect(moved).toBeDefined();
      expect(moved?.history).toHaveLength(1);
      expect(moved?.history[0].from).toBe("pending");
      expect(moved?.history[0].to).toBe("approved");
    });

    it("inserts at the specified index", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      act(() => {
        result.current.moveRequestAt("REQ-001", "approved", 0);
      });
      const approvedItems = result.current.items.filter(
        (item) => item.status === "approved"
      );
      expect(approvedItems[0].id).toBe("REQ-001");
    });

    it("allows pending → ready (skip)", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let outcome: ReturnType<typeof result.current.moveRequestAt> | undefined;
      act(() => {
        outcome = result.current.moveRequestAt("REQ-001", "ready", 0);
      });
      expect(outcome?.ok).toBe(true);
    });

    it("allows approved → pending (backward)", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let outcome: ReturnType<typeof result.current.moveRequestAt> | undefined;
      act(() => {
        outcome = result.current.moveRequestAt("REQ-003", "pending", 0);
      });
      expect(outcome?.ok).toBe(true);
    });
  });

  describe("moveRequests (bulk)", () => {
    it("moves multiple pending requests to approved", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let moved: number;
      act(() => {
        moved = result.current.moveRequests(["REQ-001", "REQ-002"], "approved");
      });
      expect(moved!).toBe(2);
      const approved = result.current.items.filter(
        (item) => item.status === "approved"
      );
      expect(approved).toHaveLength(3);
    });

    it("silently skips forbidden moves", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let moved: number;
      act(() => {
        moved = result.current.moveRequests(["REQ-005", "REQ-006"], "denied");
      });
      expect(moved!).toBe(0);
    });

    it("returns count of successfully moved items", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let moved: number;
      act(() => {
        moved = result.current.moveRequests(["REQ-001", "REQ-005"], "approved");
      });
      expect(moved!).toBe(1);
    });
  });

  describe("denyRequests", () => {
    it("denies a pending request", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let count: number;
      act(() => {
        count = result.current.denyRequests(
          ["REQ-001"],
          "Out of Stock",
          "No stock available"
        );
      });
      expect(count!).toBe(1);
      const denied = result.current.items.find((item) => item.id === "REQ-001");
      expect(denied?.status).toBe("denied");
      expect(denied?.deniedReason).toBe("Out of Stock");
      expect(denied?.deniedNote).toBe("No stock available");
    });

    it("records deny history", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      act(() => {
        result.current.denyRequests(["REQ-001"], "Out of Stock", "");
      });
      const denied = result.current.items.find((item) => item.id === "REQ-001");
      expect(denied?.history).toHaveLength(1);
      expect(denied?.history[0].to).toBe("denied");
      expect(denied?.history[0].from).toBe("pending");
    });

    it("returns 0 when no items can be denied", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let count: number;
      act(() => {
        count = result.current.denyRequests(["REQ-005"], "Out of Stock", "");
      });
      expect(count!).toBe(0);
    });

    it("denies multiple items at once", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let count: number;
      act(() => {
        count = result.current.denyRequests(
          ["REQ-001", "REQ-003"],
          "Not Available",
          ""
        );
      });
      expect(count!).toBe(2);
    });
  });

  describe("dispenseRequest", () => {
    it("dispenses a ready request to claimed", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let ok: boolean;
      act(() => {
        ok = result.current.dispenseRequest("REQ-004", {
          batch: "B-2026-04",
          expiry: "2027-06-15",
          qty: 5,
        });
      });
      expect(ok!).toBe(true);
      const claimed = result.current.items.find(
        (item) => item.id === "REQ-004"
      );
      expect(claimed?.status).toBe("claimed");
      expect(claimed?.dispensing).toBeDefined();
      expect(claimed?.dispensing?.batch).toBe("B-2026-04");
      expect(claimed?.dispensing?.qty).toBe(5);
    });

    it("rejects dispensing a non-ready request", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let ok: boolean;
      act(() => {
        ok = result.current.dispenseRequest("REQ-001", {
          batch: "B-2026-04",
          expiry: "2027-06-15",
          qty: 2,
        });
      });
      expect(ok!).toBe(false);
      expect(
        result.current.items.find((item) => item.id === "REQ-001")?.status
      ).toBe("pending");
    });

    it("rejects dispensing a claimed request", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let ok: boolean;
      act(() => {
        ok = result.current.dispenseRequest("REQ-005", {
          batch: "B-2026-04",
          expiry: "2027-06-15",
          qty: 5,
        });
      });
      expect(ok!).toBe(false);
    });

    it("records dispensing history", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      act(() => {
        result.current.dispenseRequest("REQ-004", {
          batch: "B-2026-04",
          expiry: "2027-06-15",
          qty: 5,
        });
      });
      const claimed = result.current.items.find(
        (item) => item.id === "REQ-004"
      );
      expect(claimed?.history).toHaveLength(1);
      expect(claimed?.history[0].to).toBe("claimed");
    });
  });

  describe("dispenseRequests (bulk)", () => {
    it("dispenses multiple ready requests", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let applied: number;
      act(() => {
        applied = result.current.dispenseRequests([
          {
            id: "REQ-004",
            payload: {
              batch: "B-2026-04",
              expiry: "2027-06-15",
              qty: 5,
            },
          },
        ]);
      });
      expect(applied!).toBe(1);
      expect(
        result.current.items.find((item) => item.id === "REQ-004")?.status
      ).toBe("claimed");
    });

    it("skips items that cannot be dispensed", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let applied: number;
      act(() => {
        applied = result.current.dispenseRequests([
          {
            id: "REQ-004",
            payload: {
              batch: "B-2026-04",
              expiry: "2027-06-15",
              qty: 5,
            },
          },
          {
            id: "REQ-001",
            payload: {
              batch: "B-2026-04",
              expiry: "2027-06-15",
              qty: 2,
            },
          },
        ]);
      });
      expect(applied!).toBe(1);
    });
  });

  describe("undoLastMove", () => {
    it("reverts the last move", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      act(() => {
        result.current.moveRequestAt("REQ-001", "approved", 0);
      });
      expect(
        result.current.items.find((item) => item.id === "REQ-001")?.status
      ).toBe("approved");

      let undone: boolean;
      act(() => {
        undone = result.current.undoLastMove();
      });
      expect(undone!).toBe(true);
      expect(
        result.current.items.find((item) => item.id === "REQ-001")?.status
      ).toBe("pending");
    });

    it("returns false when there is nothing to undo", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      let undone: boolean;
      act(() => {
        undone = result.current.undoLastMove();
      });
      expect(undone!).toBe(false);
    });

    it("removes the history entry on undo", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      act(() => {
        result.current.moveRequestAt("REQ-001", "approved", 0);
      });
      expect(
        result.current.items.find((item) => item.id === "REQ-001")?.history
      ).toHaveLength(1);

      act(() => {
        result.current.undoLastMove();
      });
      expect(
        result.current.items.find((item) => item.id === "REQ-001")?.history
      ).toHaveLength(0);
    });
  });

  describe("selection", () => {
    it("toggles selection", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      act(() => result.current.toggleSelect("REQ-001"));
      expect(result.current.selectedIds.has("REQ-001")).toBe(true);
      expect(result.current.selectedItems).toHaveLength(1);

      act(() => result.current.toggleSelect("REQ-001"));
      expect(result.current.selectedIds.has("REQ-001")).toBe(false);
      expect(result.current.selectedItems).toHaveLength(0);
    });

    it("selects multiple items", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      act(() => result.current.selectMany(["REQ-001", "REQ-002"], true));
      expect(result.current.selectedIds.size).toBe(2);
    });

    it("clears selection", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      act(() => result.current.selectMany(["REQ-001", "REQ-002"], true));
      act(() => result.current.clearSelection());
      expect(result.current.selectedIds.size).toBe(0);
    });
  });

  describe("replaceAll", () => {
    it("replaces all items with new ones", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      const newItems = [makeItem({ id: "REQ-NEW-1" })];
      let replaced: boolean;
      act(() => {
        replaced = result.current.replaceAll(newItems);
      });
      expect(replaced!).toBe(true);
      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].id).toBe("REQ-NEW-1");
    });

    it("refuses to replace after items have been modified", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      act(() => result.current.moveRequestAt("REQ-001", "approved", 0));

      let replaced: boolean;
      act(() => {
        replaced = result.current.replaceAll([makeItem({ id: "REQ-NEW-1" })]);
      });
      expect(replaced!).toBe(false);
      expect(result.current.items.length).toBe(ITEMS.length);
    });
  });

  describe("addNote", () => {
    it("adds an internal note to a request", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      act(() => result.current.addNote("REQ-001", "Verified by staff"));
      const item = result.current.items.find((item) => item.id === "REQ-001");
      expect(item?.notes).toHaveLength(1);
      expect(item?.notes[0].text).toBe("Verified by staff");
      expect(item?.notes[0].author).toBe("You");
    });

    it("ignores empty notes", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      act(() => result.current.addNote("REQ-001", ""));
      act(() => result.current.addNote("REQ-001", "   "));
      const item = result.current.items.find((item) => item.id === "REQ-001");
      expect(item?.notes).toHaveLength(0);
    });

    it("trims whitespace from notes", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      act(() => result.current.addNote("REQ-001", "  Note text  "));
      const item = result.current.items.find((item) => item.id === "REQ-001");
      expect(item?.notes[0].text).toBe("Note text");
    });
  });

  describe("persistence", () => {
    it("calls onPersist for each changed item on move", () => {
      const persist = vi.fn();
      const { result } = renderHook(() => useRequestBoard(ITEMS, persist));
      act(() => result.current.moveRequestAt("REQ-001", "approved", 0));
      expect(persist).toHaveBeenCalledTimes(1);
      expect(persist).toHaveBeenCalledWith(
        expect.objectContaining({ id: "REQ-001", status: "approved" })
      );
    });

    it("calls onPersist on deny", () => {
      const persist = vi.fn();
      const { result } = renderHook(() => useRequestBoard(ITEMS, persist));
      act(() => result.current.denyRequests(["REQ-001"], "Out of Stock", ""));
      expect(persist).toHaveBeenCalled();
    });

    it("calls onPersist on dispense", () => {
      const persist = vi.fn();
      const { result } = renderHook(() => useRequestBoard(ITEMS, persist));
      act(() =>
        result.current.dispenseRequest("REQ-004", {
          batch: "B-2026-04",
          expiry: "2027-06-15",
          qty: 5,
        })
      );
      expect(persist).toHaveBeenCalled();
    });
  });

  describe("re-open (denied → pending)", () => {
    it("allows denied requests to be re-opened to pending", () => {
      const { result } = renderHook(() => useRequestBoard(ITEMS));
      act(() => {
        result.current.moveRequestAt("REQ-006", "pending", 0);
      });
      expect(
        result.current.items.find((item) => item.id === "REQ-006")?.status
      ).toBe("pending");
    });
  });
});
