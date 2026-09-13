import { describe, expect, it } from "vitest";
import { searchFromFilters, validateAuditSearch } from "./audit-search";
import { buildAuditCsv } from "./export-audit";
import type { AuditFilters, AuditRow } from "./types";
import { DEFAULT_AUDIT_FILTERS, filterAuditRows } from "./types";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-12T12:00:00.000Z");

function row(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    action: "dispense",
    at: new Date(NOW).toISOString(),
    branch: "Main Clinic",
    detail: "Paracetamol 500mg −12 via REQ-1",
    id: "AUD-1",
    user: "J. Cruz",
    ...overrides,
  };
}

function filters(overrides: Partial<AuditFilters> = {}): AuditFilters {
  return { ...DEFAULT_AUDIT_FILTERS, ...overrides };
}

describe("filterAuditRows", () => {
  it("drops rows older than the selected preset window", () => {
    const rows = [
      row({ at: new Date(NOW - 2 * DAY).toISOString(), id: "recent" }),
      row({ at: new Date(NOW - 45 * DAY).toISOString(), id: "old" }),
    ];
    const result = filterAuditRows(rows, filters({ preset: "30d" }), NOW);
    expect(result.map((entry) => entry.id)).toEqual(["recent"]);
  });

  it("keeps everything for the All-time preset", () => {
    const rows = [
      row({ at: new Date(NOW - DAY).toISOString(), id: "recent" }),
      row({ at: new Date(NOW - 400 * DAY).toISOString(), id: "old" }),
    ];
    expect(filterAuditRows(rows, filters({ preset: "all" }), NOW)).toHaveLength(
      2
    );
  });

  it("filters by user and action type together", () => {
    const rows = [
      row({ id: "match" }),
      row({ id: "other-user", user: "A. Lim" }),
      row({ action: "settings", id: "other-action" }),
    ];
    const result = filterAuditRows(
      rows,
      filters({
        actions: ["dispense"],
        user: "J. Cruz",
      }),
      NOW
    );
    expect(result.map((entry) => entry.id)).toEqual(["match"]);
  });

  it("searches details, users, ids and action labels", () => {
    const rows = [
      row({ id: "AUD-9" }),
      row({ action: "settings", detail: "Settings changed", id: "AUD-2" }),
    ];
    expect(
      filterAuditRows(rows, filters({ search: "paracetamol" }), NOW)
    ).toHaveLength(1);
    expect(
      filterAuditRows(rows, filters({ search: "aud-2" }), NOW)
    ).toHaveLength(1);
    expect(
      filterAuditRows(rows, filters({ search: "settings" }), NOW)
    ).toHaveLength(1);
  });

  it("treats an empty action list as no action filter", () => {
    const rows = [row(), row({ action: "settings", id: "AUD-2" })];
    expect(filterAuditRows(rows, filters({ actions: [] }), NOW)).toHaveLength(
      2
    );
  });
});

describe("audit search params", () => {
  it("drops unknown presets; action types are validated later", () => {
    expect(
      validateAuditSearch({ actions: "sync,bogus", preset: "nope" })
    ).toEqual({ actions: "sync,bogus" });
  });

  it("omits defaults so the URL stays short", () => {
    expect(searchFromFilters(filters())).toEqual({});
  });

  it("round-trips a non-default filter set", () => {
    const search = searchFromFilters(
      filters({
        actions: ["sync", "dispense"],
        preset: "7d",
        search: "conflict",
        user: "System",
      })
    );
    expect(search).toEqual({
      actions: "sync,dispense",
      preset: "7d",
      q: "conflict",
      user: "System",
    });
  });
});

describe("buildAuditCsv", () => {
  it("quotes cells and escapes embedded quotes", () => {
    const csv = buildAuditCsv([
      row({ detail: 'Stock "correction", verified' }),
    ]);
    const dataLine = csv.split("\n")[1];
    expect(dataLine).toContain('"Stock ""correction"", verified"');
    expect(csv.split("\n")).toHaveLength(2);
  });

  it("writes a header even with no rows", () => {
    expect(buildAuditCsv([])).toContain("Timestamp");
  });
});
