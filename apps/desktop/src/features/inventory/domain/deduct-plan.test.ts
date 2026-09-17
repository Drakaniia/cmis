import { describe, expect, it } from "vitest";

import {
  dispensableTotal,
  expiryDays,
  planDeduct,
  splitFefo,
  usableBatches,
} from "./deduct-plan";

const DAY = 86_400_000;
const NOW = new Date("2026-09-17T09:00:00Z").getTime();

function iso(daysFromNow: number): string {
  return new Date(NOW + daysFromNow * DAY).toISOString();
}

const SOONER = { batch: "B-4412", expiry: iso(120), qty: 6 };
const LATER = { batch: "B-9900", expiry: iso(400), qty: 4 };

describe("expiryDays", () => {
  it("counts whole days until expiry", () => {
    expect(expiryDays(iso(10), NOW)).toBe(10);
  });

  it("treats a blank or missing expiry as no expiry", () => {
    expect(expiryDays("", NOW)).toBe(9999);
    expect(expiryDays(null, NOW)).toBe(9999);
  });
});

describe("usableBatches", () => {
  it("drops expired and empty batches and sorts FEFO", () => {
    const usable = usableBatches(
      [{ ...LATER, expiry: iso(-30) }, LATER, { ...SOONER, qty: 0 }, SOONER],
      NOW
    );
    expect(usable.map((batch) => batch.batch)).toEqual(["B-4412", "B-9900"]);
  });

  it("keeps a batch that expires today — only a past expiry is excluded", () => {
    expect(usableBatches([{ ...SOONER, expiry: iso(0) }], NOW)).toHaveLength(1);
  });
});

describe("splitFefo", () => {
  const options = usableBatches([SOONER, LATER], NOW);

  it("takes from the earliest expiry first", () => {
    expect(splitFefo(options, 3)).toEqual([
      { batch: "B-4412", expiry: SOONER.expiry, qty: 3 },
    ]);
  });

  it("continues into the next batch when one cannot cover the take", () => {
    expect(splitFefo(options, 8)).toEqual([
      { batch: "B-4412", expiry: SOONER.expiry, qty: 6 },
      { batch: "B-9900", expiry: LATER.expiry, qty: 2 },
    ]);
  });

  it("never takes more than the batches hold", () => {
    expect(dispensableTotal(options)).toBe(10);
    expect(splitFefo(options, 25)).toHaveLength(2);
  });
});

describe("planDeduct", () => {
  const options = usableBatches([SOONER, LATER], NOW);
  const base = {
    allowMissingBatch: false,
    allowPartial: false,
    batchCount: 2,
    onHand: 10,
    options,
    requested: 3,
    unit: "tabs",
  };

  it("plans a take that one batch covers", () => {
    const outcome = planDeduct(base);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.plan.take).toBe(3);
    expect(outcome.plan.leftAfter).toBe(7);
    expect(outcome.plan.missingBatch).toBe(false);
  });

  it("blocks a quantity larger than the shelf and names what is there", () => {
    const outcome = planDeduct({ ...base, requested: 12 });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.code).toBe("short");
    expect(outcome.available).toBe(10);
    expect(outcome.message).toBe("Only 10 tabs in stock.");
  });

  it("allows the partial when the caller does, leaving a remainder", () => {
    const outcome = planDeduct({
      ...base,
      allowPartial: true,
      requested: 12,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.plan.take).toBe(10);
    expect(outcome.plan.remaining).toBe(2);
  });

  it("deducts from the item total when there are no batch rows and that is allowed", () => {
    const outcome = planDeduct({
      ...base,
      allowMissingBatch: true,
      batchCount: 0,
      options: [],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.plan.missingBatch).toBe(true);
    expect(outcome.plan.batches).toEqual([]);
    expect(outcome.plan.take).toBe(3);
    expect(outcome.plan.leftAfter).toBe(7);
  });

  it("refuses an item with no batch rows when the caller does not allow it", () => {
    const outcome = planDeduct({ ...base, batchCount: 0, options: [] });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.code).toBe("no-batch");
  });

  it("blocks a batch-less take that is larger than the item total", () => {
    const outcome = planDeduct({
      ...base,
      allowMissingBatch: true,
      batchCount: 0,
      onHand: 2,
      options: [],
      requested: 5,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.code).toBe("short");
    expect(outcome.message).toContain("Only 2 tabs");
  });

  it("refuses when every batch row is expired or empty", () => {
    const outcome = planDeduct({ ...base, options: [] });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.code).toBe("no-batch");
    expect(outcome.message).toContain("No dispensable batch");
  });

  it("refuses when nothing is on hand at all", () => {
    const outcome = planDeduct({ ...base, onHand: 0, options: [] });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.message).toContain("Nothing is on hand");
  });
});
