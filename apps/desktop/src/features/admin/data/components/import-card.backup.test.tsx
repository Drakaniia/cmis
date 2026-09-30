import { Toaster } from "@cmis/ui/components/sonner";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { utils, write } from "xlsx";
import { INVENTORY_TEMPLATE_HEADERS } from "@/features/inventory/import/csv-parser";

const CONFIRM_IMPORT = /Confirm import/i;
const OVERWRITE_PROMPT = /Overwrite current data\?/i;
const IMPORT_AND_OVERWRITE = /Import and overwrite/i;
const IMPORTED_ONE = /Imported 1 medications/;

const dbExecute = vi.fn().mockResolvedValue({});
const dbSelect = vi.fn().mockImplementation((sql: string) => {
  if (sql.includes("sqlite_master")) {
    return [{ name: "inventory_items_backup_2026-08-01T00-00-00-000Z" }];
  }
  return [];
});

const runManualBackup = vi.fn();
let isDesktop = true;

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({ execute: dbExecute, select: dbSelect })),
}));

vi.mock("@/lib/open-external", () => ({
  isTauriRuntime: () => isDesktop,
}));

vi.mock("@/features/backup/hooks/use-daily-backup", () => ({
  useBackupActions: () => ({ retry: vi.fn(), runManualBackup }),
}));

import { ImportCard } from "./import-card";

const FILE_NAME = "AUGUST 2026 inventory - august r - TEMPLATE FORMAT.xlsx";

function buildXlsxFile(): File {
  const headers = [...INVENTORY_TEMPLATE_HEADERS] as string[];
  const daily = new Array(31).fill("");
  daily[0] = "5";
  return new File(
    [
      write(
        (() => {
          const wb = utils.book_new();
          utils.book_append_sheet(
            wb,
            utils.aoa_to_sheet([
              headers,
              [
                "Paracetamol",
                "500",
                "mg",
                "tabs",
                "",
                "100",
                ...daily,
                "10",
                "",
                "",
                "",
              ],
            ]),
            "Inventory"
          );
          return wb;
        })(),
        { bookType: "xlsx", type: "array" }
      ),
    ],
    FILE_NAME,
    {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
  );
}

async function uploadAndConfirm() {
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
  await user.upload(input, buildXlsxFile());
  await screen.findByText(FILE_NAME);
  await user.click(screen.getByRole("button", { name: CONFIRM_IMPORT }));
  await screen.findByText(OVERWRITE_PROMPT);
  const typeInput = document.querySelector(
    'input:not([type="file"])'
  ) as HTMLInputElement;
  await user.type(typeInput, "IMPORT");
  await user.click(screen.getByRole("button", { name: IMPORT_AND_OVERWRITE }));
}

describe("ImportCard — safety backup before an import writes rows", () => {
  beforeEach(() => {
    dbExecute.mockClear();
    dbSelect.mockClear();
    isDesktop = true;
    runManualBackup.mockReset().mockResolvedValue({ name: "cmis-manual-x.db" });
    (window as any).__inventoryImportCsv = undefined;
  });

  it("writes a safety backup before any row is inserted", async () => {
    // The confirmation used to promise "The original database is backed up
    // first" while the handler took no backup at all. An import can overwrite
    // the whole month grid, so it earns the same copy Wipe and Purge get.
    await uploadAndConfirm();

    await screen.findByText(IMPORTED_ONE);
    expect(runManualBackup).toHaveBeenCalled();
  });

  it("does not import when the safety backup fails", async () => {
    runManualBackup.mockRejectedValue(new Error("backup disk is full"));

    await uploadAndConfirm();

    await screen.findByText(/safety backup failed/i);
    expect(
      dbExecute.mock.calls.filter((c) =>
        String(c[0]).includes("INSERT INTO inventory_items")
      )
    ).toHaveLength(0);
  });
});
