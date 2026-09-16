import { beforeEach, describe, expect, it } from "vitest";
import { createFakeDb, type DbRow } from "@/test/fake-db";
import { mapAuditLogRow } from "./hooks/use-audit-log";
import {
  DEFAULT_OPERATOR,
  getOperatorName,
  resetOperatorForTesting,
  setOperatorName,
} from "./operator";
import { DEFAULT_AUDIT_FILTERS, filterAuditRows } from "./types";
import { recordAudit } from "./write-audit";

describe("recordAudit", () => {
  beforeEach(() => {
    resetOperatorForTesting();
  });

  it("inserts every mapped column", async () => {
    const db = createFakeDb();
    setOperatorName("A. Lim");

    const result = await recordAudit(db, {
      action: "correction",
      after: { qty: 250 },
      before: { qty: 450 },
      detail:
        "Deleted batch B-2027-01 from Paracetamol — 200 units (450 → 250)",
      reason: "Entered in error",
      targetId: "batch-1",
      targetKind: "batch",
    });

    expect(result.ok).toBe(true);
    const [row] = db.tables.audit_log as DbRow[];
    expect(row).toMatchObject({
      action: "correction",
      actor: "A. Lim",
      branch: "local",
      correction_of: null,
      reason: "Entered in error",
      request_ref: null,
      target_id: "batch-1",
      target_kind: "batch",
    });
    expect(JSON.parse(String(row.before_json))).toEqual({ qty: 450 });
    expect(JSON.parse(String(row.after_json))).toEqual({ qty: 250 });
    expect(row.id).toBe(result.id);
    // Unset optional state is NULL, never the string "undefined".
    expect(row.correction_of).toBeNull();
  });

  it("falls back to the neutral operator when Settings names nobody", async () => {
    const db = createFakeDb();
    await recordAudit(db, { action: "stock-in", detail: "Stock in" });
    expect(db.tables.audit_log[0].actor).toBe(DEFAULT_OPERATOR);
    expect(getOperatorName()).toBe(DEFAULT_OPERATOR);
  });

  it("treats a blank operator name as the fallback rather than an empty actor", () => {
    setOperatorName("   ");
    expect(getOperatorName()).toBe(DEFAULT_OPERATOR);
  });

  it("throws by default so an atomic caller rolls back with its data write", async () => {
    const failing = {
      execute: () => Promise.reject(new Error("disk I/O error")),
    };
    await expect(
      recordAudit(failing, { action: "correction", detail: "Deleted X" })
    ).rejects.toThrow("disk I/O error");
  });

  it("reports failure instead of throwing in best-effort mode", async () => {
    const failing = {
      execute: () => Promise.reject(new Error("disk I/O error")),
    };
    const result = await recordAudit(
      failing,
      { action: "stock-out", detail: "Stock out" },
      { bestEffort: true }
    );
    expect(result.ok).toBe(false);
    expect(result.id).toBeTruthy();
  });
});

describe("mapAuditLogRow", () => {
  const base = {
    action: "stock-in",
    actor: "A. Lim",
    after_json: JSON.stringify({ qty: 100 }),
    at: "2026-09-16T10:00:00.000Z",
    before_json: JSON.stringify({ qty: 40 }),
    branch: "local",
    corrected: 1,
    correction_of: null,
    detail: "Added 2 batches to Amoxicillin 250mg — 120 units",
    id: "AUD-1",
    reason: null,
    request_ref: null,
  };

  it("maps columns onto the existing AuditRow shape", () => {
    const row = mapAuditLogRow({
      ...base,
      correction_of: "AUD-0",
      reason: "count corrected",
    });

    expect(row).toMatchObject({
      action: "stock-in",
      at: "2026-09-16T10:00:00.000Z",
      branch: "local",
      corrected: true,
      correctionOf: "AUD-0",
      id: "AUD-1",
      reason: "count corrected",
      user: "A. Lim",
    });
    expect(row.before).toEqual({ qty: 40 });
    expect(row.after).toEqual({ qty: 100 });
  });

  it("derives corrected from correction_of instead of storing it", () => {
    expect(mapAuditLogRow({ ...base, corrected: 0 }).corrected).toBeUndefined();
    expect(mapAuditLogRow(base).corrected).toBe(true);
  });

  it("maps a malformed state column without losing the row", () => {
    const row = mapAuditLogRow({ ...base, after_json: "{not json" });
    expect(row.after).toBeUndefined();
    expect(row.detail).toContain("Amoxicillin");
  });

  it("keeps filterAuditRows working on the mapped rows", () => {
    const rows = [mapAuditLogRow(base)];
    expect(
      filterAuditRows(rows, { ...DEFAULT_AUDIT_FILTERS, preset: "all" })
    ).toHaveLength(1);
    expect(
      filterAuditRows(rows, {
        ...DEFAULT_AUDIT_FILTERS,
        preset: "all",
        search: "amoxicillin",
      })
    ).toHaveLength(1);
    expect(
      filterAuditRows(rows, {
        ...DEFAULT_AUDIT_FILTERS,
        actions: ["correction"],
        preset: "all",
      })
    ).toHaveLength(0);
  });
});
