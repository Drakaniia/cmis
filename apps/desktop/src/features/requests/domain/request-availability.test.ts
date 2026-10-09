import { describe, expect, it } from "vitest";

import type { InventoryItem } from "@/features/inventory/types";
import {
  checkRowStock,
  checkRows,
  itemAvailability,
  stockMessageFor,
} from "./request-availability";

const DAY = 86_400_000;
const NOW = new Date("2026-09-17T09:00:00Z").getTime();

function iso(daysFromNow: number, extraMs = 0): string {
  return new Date(NOW + daysFromNow * DAY + extraMs).toISOString();
}

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    batches: [],
    category: "Analgesic",
    detailsIncomplete: false,
    dispensingHistory: [],
    displayName: "Paracetamol 500 mg tablet",
    expiry: "",
    form: "tab",
    id: "item-1",
    name: "Paracetamol",
    packQty: 0,
    packSize: "",
    packUnit: "",
    qty: 0,
    sku: "SKU-001",
    status: "in",
    strengthUnit: "mg",
    strengthValue: "500",
    supplier: "",
    threshold: 0,
    ...overrides,
  };
}

function batch(qty: number, daysFromNow: number, extraMs = 0) {
  return {
    batch: "B-1",
    expiry: iso(daysFromNow, extraMs),
    qty,
    supplier: "Acme",
  };
}

describe("itemAvailability — §4.1 computation", () => {
  it("removes expired and empty batches and reserves the threshold", () => {
    const item = makeItem({
      batches: [batch(10, -5), batch(5, 0), batch(100, 120)],
      qty: 115,
      threshold: 10,
    });
    const a = itemAvailability(item, NOW);
    expect(a.dispensable).toBe(105); // expired 10 dropped; 5 (today) + 100 stay
    expect(a.onHand).toBe(115);
    expect(a.soonExpiring).toBe(5); // expires today ⇒ soon
    expect(a.reserved).toBe(10);
    expect(a.available).toBe(90); // 105 − 5 soon − 10 reserved
    expect(a.disabled).toBe(false);
    expect(a.reason).toBeNull();
  });

  it("caps dispensable at the recorded qty — planDeduct's ceiling", () => {
    const item = makeItem({ batches: [batch(50, 120)], qty: 5 });
    const a = itemAvailability(item, NOW);
    expect(a.dispensable).toBe(5);
    expect(a.available).toBe(5);
  });

  it("excludes soon-expiring stock from available", () => {
    const item = makeItem({
      batches: [batch(20, 10), batch(80, 120)],
      qty: 100,
    });
    const a = itemAvailability(item, NOW);
    expect(a.soonExpiring).toBe(20);
    expect(a.coreAvailable).toBe(80);
    expect(a.available).toBe(80);
  });
});

describe("itemAvailability — §4.2 reasons", () => {
  it("out-of-stock: nothing on file at all", () => {
    const a = itemAvailability(makeItem({ qty: 0 }), NOW);
    expect(a.reason).toBe("out-of-stock");
    expect(a.disabled).toBe(true);
  });

  it("out-of-stock wins over expired batches when the item qty is 0", () => {
    const a = itemAvailability(
      makeItem({ batches: [batch(10, -1)], qty: 0 }),
      NOW
    );
    expect(a.reason).toBe("out-of-stock");
  });

  it("out-of-stock wins over no-batch when the item qty is 0", () => {
    const a = itemAvailability(makeItem({ batches: [], qty: 0 }), NOW);
    expect(a.reason).toBe("out-of-stock");
  });

  it("no-batch: qty on file but no batch rows", () => {
    const a = itemAvailability(makeItem({ batches: [], qty: 40 }), NOW);
    expect(a.reason).toBe("no-batch");
  });

  it("all-expired: batches exist but none is dispensable", () => {
    const a = itemAvailability(
      makeItem({ batches: [batch(10, -1)], qty: 40 }),
      NOW
    );
    expect(a.reason).toBe("all-expired");
  });

  it("all-expired covers zero-qty batches too", () => {
    const a = itemAvailability(
      makeItem({ batches: [batch(0, 120)], qty: 40 }),
      NOW
    );
    expect(a.reason).toBe("all-expired");
  });

  it("expiring-only: everything left expires within 30 days", () => {
    const a = itemAvailability(
      makeItem({ batches: [batch(30, 20)], qty: 30 }),
      NOW
    );
    expect(a.reason).toBe("expiring-only");
    expect(a.coreAvailable).toBe(0);
  });

  it("reserved: threshold absorbs all core stock", () => {
    const a = itemAvailability(
      makeItem({ batches: [batch(100, 120)], qty: 100, threshold: 100 }),
      NOW
    );
    expect(a.reason).toBe("reserved");
    expect(a.available).toBe(0);
  });

  it("reserved covers a threshold far above stock", () => {
    const a = itemAvailability(
      makeItem({ batches: [batch(100, 120)], qty: 100, threshold: 500 }),
      NOW
    );
    expect(a.reason).toBe("reserved");
  });

  it("threshold 0 or negative reserves nothing", () => {
    const zero = itemAvailability(
      makeItem({ batches: [batch(50, 120)], qty: 50, threshold: 0 }),
      NOW
    );
    const negative = itemAvailability(
      makeItem({ batches: [batch(50, 120)], qty: 50, threshold: -10 }),
      NOW
    );
    expect(zero.reserved).toBe(0);
    expect(zero.available).toBe(50);
    expect(zero.reason).toBeNull();
    expect(negative.reserved).toBe(0);
    expect(negative.available).toBe(50);
  });
});

describe("expiry boundary (§4.3 notes)", () => {
  it("a batch expiring in exactly 30 days is soon — excluded", () => {
    const a = itemAvailability(
      makeItem({ batches: [batch(40, 30)], qty: 40 }),
      NOW
    );
    expect(a.soonExpiring).toBe(40);
    expect(a.available).toBe(0);
    expect(a.reason).toBe("expiring-only");
  });

  it("30 days + 1 second is not soon — included", () => {
    const a = itemAvailability(
      makeItem({ batches: [batch(40, 30, 1000)], qty: 40 }),
      NOW
    );
    expect(a.soonExpiring).toBe(0);
    expect(a.available).toBe(40);
  });

  it("blank and unparseable expiries never expire", () => {
    const blank = itemAvailability(
      makeItem({
        batches: [{ batch: "B-1", expiry: "", qty: 12, supplier: "Acme" }],
        qty: 12,
      }),
      NOW
    );
    const junk = itemAvailability(
      makeItem({
        batches: [
          { batch: "B-1", expiry: "not-a-date", qty: 12, supplier: "Acme" },
        ],
        qty: 12,
      }),
      NOW
    );
    expect(blank.soonExpiring).toBe(0);
    expect(blank.available).toBe(12);
    expect(junk.available).toBe(12);
  });
});

describe("checkRowStock — §4.3 precedence", () => {
  it("an item-level reason blocks every quantity (never reserve-dip)", () => {
    const item = makeItem({
      batches: [batch(100, 120)],
      qty: 100,
      threshold: 100,
    });
    const check = checkRowStock({ item, now: NOW, qty: 5, unit: "tabs" });
    expect(check.state).toBe("unavailable");
    expect(check.reason).toBe("reserved");
  });

  it("ok when the request fits in available", () => {
    const item = makeItem({ batches: [batch(100, 120)], qty: 100 });
    const check = checkRowStock({ item, now: NOW, qty: 40, unit: "tabs" });
    expect(check.state).toBe("ok");
    expect(check.shortBy).toBe(0);
  });

  it("shortfall when the shelf cannot cover it", () => {
    const item = makeItem({ batches: [batch(30, 120)], qty: 30 });
    const check = checkRowStock({ item, now: NOW, qty: 50, unit: "tabs" });
    expect(check.state).toBe("shortfall");
    expect(check.shortBy).toBe(20);
  });

  it("shortfall when only the soon-expiring slice is missing", () => {
    const item = makeItem({
      batches: [batch(20, 10), batch(80, 120)],
      qty: 100,
    });
    const check = checkRowStock({ item, now: NOW, qty: 90, unit: "tabs" });
    expect(check.state).toBe("shortfall");
    expect(check.shortBy).toBe(10);
  });

  it("reserve-dip when only the threshold stands in the way", () => {
    const item = makeItem({
      batches: [batch(100, 120)],
      qty: 100,
      threshold: 60,
    });
    const check = checkRowStock({ item, now: NOW, qty: 50, unit: "tabs" });
    expect(check.state).toBe("reserve-dip");
    expect(check.available).toBe(40);
    expect(check.shortBy).toBe(10);
  });

  it("pack-unit rows compare in base units", () => {
    const item = makeItem({
      batches: [batch(25, 120)],
      form: "sachet",
      packQty: 10,
      packSize: "10/box",
      packUnit: "box",
      qty: 25,
    });
    const check = checkRowStock({ item, now: NOW, qty: 3, unit: "box" });
    expect(check.requestedBaseQty).toBe(30);
    expect(check.state).toBe("shortfall");
    expect(check.shortBy).toBe(5);
  });

  it("an unconvertible unit is pack-unknown", () => {
    const item = makeItem({
      batches: [batch(25, 120)],
      form: "sachet",
      packQty: 10,
      packSize: "10/box",
      packUnit: "box",
      qty: 25,
    });
    const check = checkRowStock({ item, now: NOW, qty: 3, unit: "strip" });
    expect(check.state).toBe("pack-unknown");
    expect(check.requestedBaseQty).toBe(0);
  });
});

describe("checkRows — duplicate-row running budget (§4.3)", () => {
  const item = makeItem({ batches: [batch(40, 120)], qty: 40 });

  it("spends the budget in form order", () => {
    const checks = checkRows(
      [
        { item, key: "r1", qty: 30, unit: "tabs" },
        { item, key: "r2", qty: 30, unit: "tabs" },
      ],
      NOW
    );
    expect(checks.get("r1")?.state).toBe("ok");
    const second = checks.get("r2");
    expect(second?.state).toBe("shortfall");
    expect(second?.available).toBe(10);
    expect(second?.shortBy).toBe(20);
    expect(second?.afterOtherRow).toBe(true);
    expect(second?.reason).toBeNull();
  });

  it("budgets across different typed strings resolving to one item", () => {
    const packItem = makeItem({
      batches: [batch(40, 120)],
      form: "sachet",
      packQty: 10,
      packSize: "10/box",
      packUnit: "box",
      qty: 40,
    });
    const checks = checkRows(
      [
        { item: packItem, key: "r1", qty: 3, unit: "box" },
        { item: packItem, key: "r2", qty: 20, unit: "sachet" },
      ],
      NOW
    );
    expect(checks.get("r1")?.state).toBe("ok");
    const second = checks.get("r2");
    expect(second?.requestedBaseQty).toBe(20);
    expect(second?.state).toBe("shortfall");
    expect(second?.shortBy).toBe(10);
  });

  it("an exhausted budget warns, never blocks as unavailable", () => {
    const scarce = makeItem({
      batches: [batch(10, 120)],
      qty: 10,
      threshold: 5,
    });
    const checks = checkRows(
      [
        { item: scarce, key: "r1", qty: 8, unit: "tabs" },
        { item: scarce, key: "r2", qty: 8, unit: "tabs" },
      ],
      NOW
    );
    const second = checks.get("r2");
    expect(second?.state).toBe("shortfall");
    expect(second?.reason).toBeNull();
  });

  it("omits rows the structural rowProblem owns", () => {
    const checks = checkRows(
      [
        { item: null, key: "r1", qty: 1, unit: "tabs" },
        { item, key: "r2", qty: null, unit: "tabs" },
      ],
      NOW
    );
    expect(checks.size).toBe(0);
  });

  it("skips ids missing from a supplied fresh-availability map", () => {
    const fresh = new Map<string, ReturnType<typeof itemAvailability>>();
    const checks = checkRows(
      [{ item, key: "r1", qty: 1, unit: "tabs" }],
      NOW,
      fresh
    );
    expect(checks.has("r1")).toBe(false);
  });
});

describe("stockMessageFor (§8)", () => {
  it("names the shortfall in pack-aware quantities", () => {
    const item = makeItem({
      batches: [batch(25, 120)],
      form: "sachet",
      packQty: 10,
      packSize: "10/box",
      packUnit: "box",
      qty: 25,
    });
    const check = checkRowStock({ item, now: NOW, qty: 3, unit: "box" });
    expect(stockMessageFor(check)).toBe(
      "Only 25 sachet (2 box + 5 sachet) requestable — 5 sachet short of 30 sachet (3 box)."
    );
  });

  it("says nothing for an ok row", () => {
    const item = makeItem({ batches: [batch(100, 120)], qty: 100 });
    const check = checkRowStock({ item, now: NOW, qty: 5, unit: "tabs" });
    expect(stockMessageFor(check)).toBe("");
  });

  it("speaks the operator's refusal wording for a blocked item", () => {
    const check = checkRowStock({
      item: makeItem({ batches: [], qty: 40 }),
      now: NOW,
      qty: 5,
      unit: "tabs",
    });
    expect(stockMessageFor(check)).toBe("No batch on record — stock in first.");
  });
});
