import { describe, expect, it, vi } from "vitest";
import { rejectionFrom } from "@/test/rejection";
import { INVENTORY_TEMPLATE_HEADERS } from "./csv-parser";
import { importInventoryCsv } from "./import";

const HEADER = INVENTORY_TEMPLATE_HEADERS.join(",");

function buildLine(cells: (string | number | null)[]): string {
  return cells
    .map((c) => {
      const s = String(c ?? "");
      return s.includes(",") ? `"${s}"` : s;
    })
    .join(",");
}

function buildRow(input: {
  category?: string;
  daily?: (string | number | null)[];
  form?: string;
  name: string;
  packSize?: string;
  stockOnHand?: string | number | null;
  strengthUnit?: string;
  strengthValue?: string;
  supplier?: string;
  totalDispensed?: string | number | null;
}): string {
  const daily = input.daily ?? new Array(31).fill("");
  const cells: (string | number | null)[] = [
    input.name,
    input.strengthValue ?? "",
    input.strengthUnit ?? "",
    input.form ?? "",
    input.packSize ?? "",
    input.stockOnHand ?? "",
    ...daily.slice(0, 31),
    input.totalDispensed ?? "",
    "",
    input.category ?? "",
    input.supplier ?? "",
  ];
  return buildLine(cells);
}

function createMockDb(
  existing: {
    id: string;
    name: string;
    dosage: string;
    sku: string;
    category: string | null;
  }[] = []
) {
  const execute = vi.fn().mockResolvedValue({});
  const select = vi.fn().mockImplementation((sql: string) => {
    if (
      sql.includes("sqlite_master") &&
      sql.includes("inventory_items_backup")
    ) {
      return [];
    }
    if (
      sql.includes("sqlite_master") &&
      sql.includes("dispensing_events_backup")
    ) {
      return [];
    }
    if (sql.includes("SELECT sku FROM inventory_items")) {
      return [];
    }
    if (sql.includes("SELECT id, name, dosage")) {
      return existing;
    }
    if (sql.includes("SELECT COUNT")) {
      return [{ c: 0 }];
    }
    return [];
  });
  return { execute, select } as any;
}

describe("importInventoryCsv", () => {
  it("inserts rows with UUID+SKU, handles stock 0 qty 0, creates dispensing_events", async () => {
    const db = createMockDb();
    const daily = new Array(31).fill("");
    daily[0] = "5";
    daily[1] = "5";
    const line = buildRow({
      daily,
      form: "tabs",
      name: "TestMed",
      packSize: "",
      stockOnHand: "100",
      strengthUnit: "mg",
      strengthValue: "10",
      totalDispensed: "10",
    });
    const csv = [HEADER, line].join("\n");
    const res = await importInventoryCsv(csv, db, { month: "2026-08" });
    expect(res.inserted).toBe(1);
    expect(res.imported).toBe(1);
    expect(res.needsBatchCount).toBe(1);
    const inserts = db.execute.mock.calls.filter((c: any[]) =>
      String(c[0]).includes("INSERT INTO inventory_items")
    );
    expect(inserts.length).toBe(1);
    // Both days travel in one multi-row INSERT, not one statement per day.
    const dispInserts = db.execute.mock.calls.filter((c: any[]) =>
      String(c[0]).includes("INSERT INTO dispensing_events")
    );
    expect(dispInserts.length).toBe(1);
    expect(dispInserts[0][1]).toHaveLength(10);
  });

  it("never issues BEGIN/COMMIT/ROLLBACK — the plugin serves each execute from its pool", async () => {
    const db = createMockDb();
    const line = buildRow({
      form: "tabs",
      name: "TxMed",
      stockOnHand: "10",
      strengthUnit: "mg",
      strengthValue: "5",
    });
    const csv = [HEADER, line].join("\n");

    await importInventoryCsv(csv, db, { month: "2026-08" });

    const statements: string[] = db.execute.mock.calls.map((c: any[]) =>
      String(c[0]).trim().toUpperCase()
    );
    for (const transactionStatement of ["BEGIN", "COMMIT", "ROLLBACK"]) {
      expect(statements).not.toContain(transactionStatement);
    }
  });

  it("restores the snapshot and rethrows the original error when a write fails", async () => {
    const existing = [
      {
        category: null,
        dosage: "500 mg tabs",
        id: "existing-uuid",
        name: "Paracetamol",
        sku: "SKU-PARA-500",
      },
    ];
    const db = createMockDb(existing);
    db.execute.mockImplementation((sql: string) => {
      if (String(sql).includes("INSERT INTO dispensing_events")) {
        throw new Error("disk I/O error");
      }
      return {};
    });
    const daily = new Array(31).fill("");
    daily[0] = "5";
    const line = buildRow({
      daily,
      form: "tabs",
      name: "Paracetamol",
      stockOnHand: "50",
      strengthUnit: "mg",
      strengthValue: "500",
    });
    const csv = [HEADER, line].join("\n");

    await expect(
      importInventoryCsv(csv, db, { month: "2026-08" })
    ).rejects.toThrow("disk I/O error");

    const statements: string[] = db.execute.mock.calls.map((c: any[]) =>
      String(c[0])
    );
    const restore = statements.find((sql) =>
      sql.includes('FROM "inventory_items_backup_')
    );
    expect(restore).toContain("UPDATE inventory_items SET");
    expect(restore).toContain("WHERE b.id = inventory_items.id");
    expect(
      statements.some((sql) =>
        sql.includes("DELETE FROM dispensing_events WHERE month = ?")
      )
    ).toBe(true);
    expect(
      statements.some(
        (sql) =>
          sql.includes("INSERT INTO dispensing_events") &&
          sql.includes('FROM "dispensing_events_backup_')
      )
    ).toBe(true);
  });

  it("reports a failing rollback without hiding the cause", async () => {
    const existing = [
      {
        category: null,
        dosage: "500 mg tabs",
        id: "existing-uuid",
        name: "Paracetamol",
        sku: "SKU-PARA-500",
      },
    ];
    const db = createMockDb(existing);
    let calls = 0;
    db.execute.mockImplementation(() => {
      calls += 1;
      // Two snapshot tables, the row's UPDATE and its event DELETE land; from
      // the event INSERT on, every write fails — including the rollback's own.
      if (calls > 4) {
        throw new Error("disk I/O error");
      }
      return {};
    });
    const daily = new Array(31).fill("");
    daily[0] = "5";
    const line = buildRow({
      daily,
      form: "tabs",
      name: "Paracetamol",
      stockOnHand: "50",
      strengthUnit: "mg",
      strengthValue: "500",
    });
    const csv = [HEADER, line].join("\n");

    const rejection = await rejectionFrom(
      importInventoryCsv(csv, db, { month: "2026-08" })
    );

    expect(rejection).toBeInstanceOf(Error);
    expect(rejection.message).toContain("disk I/O error");
    expect(rejection.message).toContain("automatic rollback failed");
  });

  it("handles stock 0 with qty 0 and is_no_stock flag", async () => {
    const db = createMockDb();
    const line = buildRow({
      form: "suspension",
      name: "Aluminum",
      packSize: "60ml",
      stockOnHand: "0",
      strengthUnit: "mg/ml",
      strengthValue: "200",
    });
    const csv = [HEADER, line].join("\n");
    const res = await importInventoryCsv(csv, db, { month: "2026-08" });
    expect(res.inserted).toBe(1);
    const invInsert = db.execute.mock.calls.find((c: any[]) =>
      String(c[0]).includes("INSERT INTO inventory_items")
    );
    expect(invInsert).toBeDefined();
    const params = invInsert?.[1] as unknown[];
    expect(params[10]).toBe(0);
    // is_no_stock param index 16
    expect(params[16]).toBe(1);
  });

  it("upserts by name+dosage preserving UUID/sku and updates category/supplier", async () => {
    const existing = [
      {
        category: null,
        dosage: "500 mg tabs",
        id: "existing-uuid",
        name: "Paracetamol",
        sku: "SKU-PARA-500",
      },
    ];
    const db = createMockDb(existing);
    const line = buildRow({
      category: "Analgesic",
      form: "tabs",
      name: "Paracetamol",
      packSize: "",
      stockOnHand: "50",
      strengthUnit: "mg",
      strengthValue: "500",
      supplier: "New Supplier",
      totalDispensed: "0",
    });
    const csv = [HEADER, line].join("\n");
    const res = await importInventoryCsv(csv, db, { month: "2026-08" });
    expect(res.updated).toBe(1);
    expect(res.inserted).toBe(0);
    const updateCalls = db.execute.mock.calls.filter((c: any[]) =>
      String(c[0]).includes("UPDATE inventory_items")
    );
    expect(updateCalls.length).toBe(1);
    const inserts = db.execute.mock.calls.filter((c: any[]) =>
      String(c[0]).includes("INSERT INTO inventory_items")
    );
    expect(inserts.length).toBe(0);
    // supplier should be updated via COALESCE
    const updateSql = String(updateCalls[0][0]);
    expect(updateSql).toContain("supplier = COALESCE");
  });

  it("uses sheet category when non-blank and falls back to guessCategory otherwise", async () => {
    const db = createMockDb();
    // Paracetamol -> guess Analgesic, but sheet says Other -> should fallback to guess
    const lineOther = buildRow({
      category: "Other",
      form: "tabs",
      name: "Paracetamol",
      strengthUnit: "mg",
      strengthValue: "500",
    });
    const csv = [HEADER, lineOther].join("\n");
    await importInventoryCsv(csv, db, { month: "2026-08" });
    const insert = db.execute.mock.calls.find((c: any[]) =>
      String(c[0]).includes("INSERT INTO inventory_items")
    );
    const params = insert?.[1] as unknown[];
    // category param index 13
    expect(params[13]).toBe("Analgesic");
  });

  it("creates backup table and keeps last 3", async () => {
    const db = createMockDb();
    const line = buildRow({
      form: "tabs",
      name: "TestMed",
      stockOnHand: "10",
      strengthUnit: "mg",
      strengthValue: "10",
    });
    const csv = [HEADER, line].join("\n");
    await importInventoryCsv(csv, db, { month: "2026-08" });
    const backupCreates = db.execute.mock.calls.filter((c: any[]) =>
      String(c[0]).includes("inventory_items_backup_")
    );
    expect(backupCreates.length).toBeGreaterThanOrEqual(1);
  });
});
