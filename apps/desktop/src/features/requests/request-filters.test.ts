import { describe, expect, it } from "vitest";

import {
  applyRequestFilters,
  DEFAULT_REQUEST_FILTERS,
  isWithinDateRange,
} from "./hooks/use-request-filters";
import {
  filtersFromSearch,
  requestsSearchEquals,
  searchFromFilters,
  validateRequestsSearch,
} from "./request-search";
import type { RequestFilters, RequestItem } from "./types";

const DAY_MS = 86_400_000;
const NOW = new Date("2026-09-12T14:00:00").getTime();

function item(overrides: Partial<RequestItem> = {}): RequestItem {
  return {
    category: "Analgesic",
    dispensingRecords: [],
    history: [],
    id: "REQ-2026-0001",
    medicine: "Paracetamol 500mg",
    notes: [],
    qty: 2,
    reason: "test",
    requestor: { email: "a@b.c", id: "STU-2024-0831", name: "Maria Santos" },
    source: "queue",
    status: "pending",
    submittedAt: new Date(NOW).toISOString(),
    unit: "tabs",
    ...overrides,
  };
}

const QUERY = { requestor: "", search: "" };

function withFilters(overrides: Partial<RequestFilters> = {}): RequestFilters {
  return { ...DEFAULT_REQUEST_FILTERS, ...overrides };
}

describe("applyRequestFilters", () => {
  it("searches requestor name, ID and medicine", () => {
    const items = [
      item(),
      item({
        id: "REQ-2026-0002",
        medicine: "Amoxicillin 500mg",
        requestor: {
          email: "x@y.z",
          id: "STU-2025-0117",
          name: "Carlo Mendoza",
        },
      }),
    ];

    expect(
      applyRequestFilters(
        items,
        withFilters(),
        { requestor: "", search: "ibu" },
        NOW
      )
    ).toEqual([]);
    expect(
      applyRequestFilters(
        items,
        withFilters(),
        { requestor: "", search: "amoxi" },
        NOW
      )
    ).toHaveLength(1);
    expect(
      applyRequestFilters(
        items,
        withFilters(),
        { requestor: "", search: "STU-2025" },
        NOW
      )
    ).toHaveLength(1);
  });

  it("keeps the Requestor field to name and ID only", () => {
    const items = [item()];
    expect(
      applyRequestFilters(
        items,
        withFilters(),
        { requestor: "paracetamol", search: "" },
        NOW
      )
    ).toEqual([]);
    expect(
      applyRequestFilters(
        items,
        withFilters(),
        { requestor: "maria", search: "" },
        NOW
      )
    ).toHaveLength(1);
  });

  it("combines category and text filters", () => {
    const items = [
      item(),
      item({ category: "Antibiotic", id: "REQ-2026-0003" }),
    ];
    expect(
      applyRequestFilters(
        items,
        withFilters({ category: "Antibiotic" }),
        QUERY,
        NOW
      ).map((entry) => entry.id)
    ).toEqual(["REQ-2026-0003"]);
  });
});

describe("isWithinDateRange", () => {
  it("bounds the Today preset to the local start of day", () => {
    const today = new Date(NOW).toISOString();
    const yesterday = new Date(NOW - DAY_MS).toISOString();
    expect(
      isWithinDateRange(today, withFilters({ datePreset: "today" }), NOW)
    ).toBe(true);
    expect(
      isWithinDateRange(yesterday, withFilters({ datePreset: "today" }), NOW)
    ).toBe(false);
  });

  it("bounds the 7d and 30d presets", () => {
    const sixDays = new Date(NOW - 6 * DAY_MS).toISOString();
    const eightDays = new Date(NOW - 8 * DAY_MS).toISOString();
    const twentyDays = new Date(NOW - 20 * DAY_MS).toISOString();
    expect(
      isWithinDateRange(sixDays, withFilters({ datePreset: "7d" }), NOW)
    ).toBe(true);
    expect(
      isWithinDateRange(eightDays, withFilters({ datePreset: "7d" }), NOW)
    ).toBe(false);
    expect(
      isWithinDateRange(eightDays, withFilters({ datePreset: "30d" }), NOW)
    ).toBe(true);
    expect(
      isWithinDateRange(
        new Date(NOW - 40 * DAY_MS).toISOString(),
        withFilters({ datePreset: "30d" }),
        NOW
      )
    ).toBe(false);
    expect(
      isWithinDateRange(twentyDays, withFilters({ datePreset: "all" }), NOW)
    ).toBe(true);
  });

  it("includes the whole of the custom end day", () => {
    const filters = withFilters({
      datePreset: "custom",
      from: "2026-09-10",
      to: "2026-09-12",
    });
    expect(isWithinDateRange("2026-09-12T23:30:00", filters, NOW)).toBe(true);
    expect(isWithinDateRange("2026-09-09T23:30:00", filters, NOW)).toBe(false);
  });

  it("treats an unset custom range as open", () => {
    expect(
      isWithinDateRange(
        "2020-01-01T00:00:00",
        withFilters({ datePreset: "custom" }),
        NOW
      )
    ).toBe(true);
  });
});

describe("URL search round-trip", () => {
  it("round-trips every filter through the URL", () => {
    const filters = withFilters({
      category: "Antibiotic",
      datePreset: "custom",
      from: "2026-09-01",
      requestor: "Maria",
      search: "paracetamol",
      to: "2026-09-12",
    });
    const search = searchFromFilters(filters);
    expect(filtersFromSearch(search)).toMatchObject({
      category: "Antibiotic",
      datePreset: "custom",
      from: "2026-09-01",
      requestor: "Maria",
      search: "paracetamol",
      to: "2026-09-12",
    });
  });

  it("omits default filter values from the URL", () => {
    expect(searchFromFilters(DEFAULT_REQUEST_FILTERS)).toEqual({});
  });

  it("drops junk and invalid presets while validating", () => {
    expect(
      validateRequestsSearch({ bogus: "x", preset: "yesterday", q: "  para  " })
    ).toEqual({ q: "para" });
  });

  it("compares two searches by value", () => {
    expect(requestsSearchEquals({}, { preset: "all" })).toBe(true);
    expect(requestsSearchEquals({ q: "a" }, {})).toBe(false);
    expect(requestsSearchEquals({ q: "a" }, { preset: "today", q: "a" })).toBe(
      false
    );
  });
});
