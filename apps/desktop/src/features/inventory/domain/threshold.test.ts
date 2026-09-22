import { describe, expect, it } from "vitest";
import {
  deriveThreshold,
  leadTimeFor,
  THRESHOLD_DEFAULT_LEAD_DAYS,
  THRESHOLD_SAFETY_DAYS,
} from "./threshold";

/** A full 31-day grid with `value` dispensed on each of the first `days` days. */
function grid(value: number, days = 31): number[] {
  return Array.from({ length: 31 }, (_, index) => (index < days ? value : 0));
}

describe("leadTimeFor", () => {
  it("uses the shared supplier lead time", () => {
    expect(leadTimeFor("HealthPlus")).toBe(2);
    expect(leadTimeFor("PharmaCorp")).toBe(3);
  });

  it("falls back to the default for a blank or unknown supplier", () => {
    expect(leadTimeFor("")).toBe(THRESHOLD_DEFAULT_LEAD_DAYS);
    expect(leadTimeFor(null)).toBe(THRESHOLD_DEFAULT_LEAD_DAYS);
    expect(leadTimeFor("No Such Supplier")).toBe(THRESHOLD_DEFAULT_LEAD_DAYS);
    expect(leadTimeFor("  PharmaCorp  ")).toBe(3);
  });
});

describe("deriveThreshold", () => {
  it("returns 0 when the month shows no dispensing", () => {
    expect(deriveThreshold({ daily: grid(0), supplier: "PharmaCorp" })).toBe(0);
    expect(deriveThreshold({ daily: [], supplier: null })).toBe(0);
  });

  it("is average daily usage times lead time plus safety", () => {
    // 1/day for 31 days, unknown supplier → 7 + 3 days of cover.
    expect(deriveThreshold({ daily: grid(1), supplier: null })).toBe(
      1 * (THRESHOLD_DEFAULT_LEAD_DAYS + THRESHOLD_SAFETY_DAYS)
    );
    // HealthPlus leads in 2 days → 5 days of cover.
    expect(deriveThreshold({ daily: grid(1), supplier: "HealthPlus" })).toBe(5);
  });

  it("rounds up, never down", () => {
    // 143 over 31 days ≈ 4.613/day; ×10 cover = 46.13 → 47.
    expect(deriveThreshold({ daily: grid(143, 1), supplier: null })).toBe(47);
  });

  it("never drops below 1 when there is any usage at all", () => {
    // 1 dispensed across the whole month ≈ 0.032/day; ×10 = 0.32 → 1.
    expect(deriveThreshold({ daily: grid(1, 1), supplier: null })).toBe(1);
  });

  it("ignores non-finite cells rather than producing NaN", () => {
    const daily = grid(0);
    daily[0] = Number.NaN;
    daily[1] = 10;
    expect(Number.isFinite(deriveThreshold({ daily, supplier: null }))).toBe(
      true
    );
    expect(deriveThreshold({ daily, supplier: null })).toBe(
      Math.ceil(
        (10 / 31) * (THRESHOLD_DEFAULT_LEAD_DAYS + THRESHOLD_SAFETY_DAYS)
      )
    );
  });
});
