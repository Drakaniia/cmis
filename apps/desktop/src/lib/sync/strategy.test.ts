import { describe, expect, it } from "vitest";

import {
  classifySyncSituation,
  explainNoDownload,
  isSyncStrategy,
  rememberStrategy,
  strategyForEndpoint,
} from "./strategy";

describe("the decision table", () => {
  it("classifies the four states of §6.1", () => {
    // Neither side: idle, nothing to do.
    expect(
      classifySyncSituation({ cloudHasData: false, localHasData: false })
    ).toBe("idle");
    // Empty device, populated cloud: the guaranteed silent pull (D13).
    expect(
      classifySyncSituation({ cloudHasData: true, localHasData: false })
    ).toBe("pull-only");
    // Populated device, empty cloud: push, warned only by the toggle modal.
    expect(
      classifySyncSituation({ cloudHasData: false, localHasData: true })
    ).toBe("push-only");
    // Both: ask, never a silent overwrite (D1/D4).
    expect(
      classifySyncSituation({ cloudHasData: true, localHasData: true })
    ).toBe("overlap");
  });
});

describe("per-endpoint strategy memory", () => {
  it("recognises only the three known strategies", () => {
    expect(isSyncStrategy("local")).toBe(true);
    expect(isSyncStrategy("cloud")).toBe(true);
    expect(isSyncStrategy("merge")).toBe(true);
    expect(isSyncStrategy("overwrite")).toBe(false);
    expect(isSyncStrategy(undefined)).toBe(false);
  });

  it("looks a strategy up by endpoint and ignores an unknown one", () => {
    const strategies = { "https://a.test": "cloud" as const };
    expect(strategyForEndpoint(strategies, "https://a.test")).toBe("cloud");
    expect(strategyForEndpoint(strategies, "https://b.test")).toBeNull();
    expect(strategyForEndpoint(undefined, "https://a.test")).toBeNull();
    // An empty endpoint is not a key; it must not inherit a stale decision.
    expect(strategyForEndpoint(strategies, "")).toBeNull();
  });

  it("records a strategy without disturbing another endpoint's", () => {
    const first = rememberStrategy({}, "https://a.test", "merge");
    const second = rememberStrategy(first, "https://b.test", "cloud");
    expect(second).toEqual({
      "https://a.test": "merge",
      "https://b.test": "cloud",
    });
  });

  it("repointing at a new URL asks again (no inherited decision)", () => {
    const strategies = rememberStrategy({}, "https://old.test", "cloud");
    expect(strategyForEndpoint(strategies, "https://new.test")).toBeNull();
  });
});

describe("the 'why did nothing download?' explanation", () => {
  it("stays quiet when a run applied something", () => {
    expect(
      explainNoDownload({
        applied: 1,
        cloudTotal: 10,
        localTotal: 0,
        ranPull: true,
        skipped: 0,
      })
    ).toBeNull();
  });

  it("stays quiet when the cloud has no more than the device", () => {
    expect(
      explainNoDownload({
        applied: 0,
        cloudTotal: 5,
        localTotal: 5,
        ranPull: true,
        skipped: 0,
      })
    ).toBeNull();
  });

  it("says no pull ran rather than showing a silent zero", () => {
    expect(
      explainNoDownload({
        applied: 0,
        cloudTotal: 85,
        localTotal: 0,
        ranPull: false,
        skipped: 0,
      })
    ).toBe("No pull was performed this run.");
  });

  it("reports skipped rows when the cloud holds more", () => {
    expect(
      explainNoDownload({
        applied: 0,
        cloudTotal: 85,
        localTotal: 0,
        ranPull: true,
        skipped: 3,
      })
    ).toContain("3 cloud rows skipped");
  });

  it("names the cursor as the cause when nothing was skipped", () => {
    expect(
      explainNoDownload({
        applied: 0,
        cloudTotal: 85,
        localTotal: 0,
        ranPull: true,
        skipped: 0,
      })
    ).toContain("pull cursor");
  });
});
