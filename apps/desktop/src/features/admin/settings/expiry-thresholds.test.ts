import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetExpiryThresholdsForTests,
  coerceExpiryThresholds,
  getExpiryThresholds,
  setExpiryThresholds,
} from "./expiry-thresholds";

describe("expiry thresholds store", () => {
  beforeEach(() => {
    __resetExpiryThresholdsForTests();
  });

  it("defaults to orange 30 / red 7", () => {
    expect(getExpiryThresholds()).toEqual({ orangeDays: 30, redDays: 7 });
  });

  it("migrates the legacy single-window shape", () => {
    expect(coerceExpiryThresholds({ expiryWindowDays: 60 })).toEqual({
      orangeDays: 60,
      redDays: 7,
    });
    expect(coerceExpiryThresholds({})).toEqual({
      orangeDays: 30,
      redDays: 7,
    });
  });

  it("clamps to 1..365 and keeps red below orange", () => {
    expect(coerceExpiryThresholds({ orangeDays: 0, redDays: 500 })).toEqual({
      orangeDays: 365,
      redDays: 364,
    });
    expect(
      coerceExpiryThresholds({ orangeDays: "soon", redDays: Number.NaN })
    ).toEqual({ orangeDays: 30, redDays: 7 });
  });

  it("persists patches to localStorage", () => {
    setExpiryThresholds({ orangeDays: 45, redDays: 10 });

    expect(getExpiryThresholds()).toEqual({ orangeDays: 45, redDays: 10 });
    expect(localStorage.getItem("cmis:expiry-thresholds")).toBe(
      JSON.stringify({ orangeDays: 45, redDays: 10 })
    );
  });
});
