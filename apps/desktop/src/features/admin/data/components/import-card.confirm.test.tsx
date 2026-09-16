import { Toaster } from "@cmis/ui/components/sonner";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { utils, write } from "xlsx";
import { INVENTORY_TEMPLATE_HEADERS } from "@/features/inventory/import/csv-parser";

const DISPENSING_MONTH = /Dispensing month 2026-08 · from the file name/i;
const CONFIRM_IMPORT = /Confirm import/i;
const OVERWRITE_PROMPT = /Overwrite current data\?/i;
const IMPORT_AND_OVERWRITE = /Import and overwrite/i;
const IMPORTED_ONE = /Imported 1 medications/;
const INVENTORY_CSV = /Inventory CSV/i;
const NOTHING_IMPORTED = /Nothing imported/i;

// Mock only the external service boundary (Tauri SQLite plugin); the CSV/xlsx
// pipeline under test stays real.
const dbExecute = vi.fn().mockResolvedValue({});
const dbSelect = vi.fn().mockImplementation((sql: string) => {
  if (sql.includes("sqlite_master")) {
    return [{ name: "inventory_items_backup_2026-08-01T00-00-00-000Z" }];
  }
  if (sql.includes("SELECT sku FROM inventory_items")) {
    return [];
  }
  // The preview reads the strength columns now, not a composed `dosage`.
  if (sql.includes("SELECT name, display_name")) {
    return [];
  }
  return [];
});

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({
    execute: dbExecute,
    select: dbSelect,
  })),
}));

import { ImportCard } from "./import-card";

/** The clinic's naming: the file name is where the dispensing month lives. */
const FILE_NAME = "AUGUST 2026 inventory - august r - TEMPLATE FORMAT.xlsx";

function buildXlsxFile(
  rows: (string | number | null)[][],
  fileName = FILE_NAME
): File {
  const headers = [...INVENTORY_TEMPLATE_HEADERS] as string[];
  return new File(
    [
      write(
        (() => {
          const wb = utils.book_new();
          utils.book_append_sheet(
            wb,
            utils.aoa_to_sheet([headers, ...rows]),
            "Inventory"
          );
          return wb;
        })(),
        { bookType: "xlsx", type: "array" }
      ),
    ],
    fileName,
    {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
  );
}

function build41Row(input: {
  daily?: (string | number | null)[];
  form?: string;
  name: string;
  packSize?: string;
  stockOnHand?: string | number | null;
  strengthUnit?: string;
  strengthValue?: string;
  totalDispensed?: string | number | null;
}): (string | number | null)[] {
  const daily = input.daily ?? new Array(31).fill("");
  return [
    input.name,
    input.strengthValue ?? "",
    input.strengthUnit ?? "",
    input.form ?? "",
    input.packSize ?? "",
    input.stockOnHand ?? "",
    ...daily.slice(0, 31),
    input.totalDispensed ?? "",
    "",
    "",
    "",
  ];
}

describe("ImportCard — Excel confirm → SQLite", () => {
  beforeEach(() => {
    dbExecute.mockClear();
    dbSelect.mockClear();
    (window as any).__inventoryImportCsv = undefined;
  });

  it("committing an xlsx import calls getDb and inserts via importInventoryCsv", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Toaster position="bottom-right" richColors />
        <ImportCard />
      </>
    );

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const daily = new Array(31).fill("");
    daily[0] = "5";
    daily[1] = "5";
    await user.upload(
      input,
      buildXlsxFile([
        build41Row({
          daily,
          form: "tabs",
          name: "Paracetamol",
          packSize: "",
          stockOnHand: "100",
          strengthUnit: "mg",
          strengthValue: "500",
          totalDispensed: "10",
        }),
      ])
    );

    await screen.findByText(FILE_NAME);
    // The month comes from the file name, shown before anything is written.
    expect(screen.getByText(DISPENSING_MONTH)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: CONFIRM_IMPORT }));
    await screen.findByText(OVERWRITE_PROMPT);

    const typeInput = document.querySelector(
      'input:not([type="file"])'
    ) as HTMLInputElement;
    await user.type(typeInput, "IMPORT");
    await user.click(
      screen.getByRole("button", { name: IMPORT_AND_OVERWRITE })
    );

    await screen.findByText(IMPORTED_ONE);

    // No SQL transaction: tauri-plugin-sql serves each execute from an
    // arbitrary pooled connection, so BEGIN/COMMIT cannot span a statement run.
    const statements = dbExecute.mock.calls.map((c) =>
      String(c[0]).trim().toUpperCase()
    );
    for (const transactionStatement of ["BEGIN", "COMMIT", "ROLLBACK"]) {
      expect(statements).not.toContain(transactionStatement);
    }

    const itemInserts = dbExecute.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO inventory_items")
    );
    expect(itemInserts).toHaveLength(1);

    const dispInserts = dbExecute.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO dispensing_events")
    );
    // 2 daily entries of 5 each, in a single multi-row INSERT
    expect(dispInserts).toHaveLength(1);
    const [dispInsert] = dispInserts;
    expect(dispInsert).toBeDefined();
    if (dispInsert) {
      const params = dispInsert[1] as unknown[];
      expect(params).toHaveLength(10);
      expect(params[0]).toBe(params[5]);
      expect(params.slice(0, 5)).toEqual([
        expect.any(String),
        "2026-08-01",
        1,
        "2026-08",
        5,
      ]);
      expect(params.slice(5)).toEqual([
        expect.any(String),
        "2026-08-02",
        2,
        "2026-08",
        5,
      ]);
    }
  });

  it("warns that a preview-only file imported nothing", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Toaster position="bottom-right" richColors />
        <ImportCard />
      </>
    );

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(
      input,
      new File(
        [JSON.stringify([{ id: "inv-001", name: "Paracetamol" }])],
        "backup.json",
        {
          type: "application/json",
        }
      )
    );

    await screen.findByText("backup.json");
    expect(screen.queryByText(INVENTORY_CSV)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: CONFIRM_IMPORT }));
    await screen.findByText(OVERWRITE_PROMPT);

    const typeInput = document.querySelector(
      'input:not([type="file"])'
    ) as HTMLInputElement;
    await user.type(typeInput, "IMPORT");
    await user.click(
      screen.getByRole("button", { name: IMPORT_AND_OVERWRITE })
    );

    // No importer exists for .json, so the card must say nothing was written
    // instead of claiming a success it never performed.
    await screen.findByText(NOTHING_IMPORTED);
    expect(dbExecute).not.toHaveBeenCalled();
    expect(dbSelect).not.toHaveBeenCalled();
  });
});
