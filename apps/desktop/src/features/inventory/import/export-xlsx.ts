import { utils, writeFile } from "xlsx";
import { INVENTORY_TEMPLATE_HEADERS } from "./csv-parser";

/**
 * Template export (spec §10, decision 14).
 *
 * The four strength columns are written **from the stored values**, verbatim.
 * The exporter used to run regex heuristics over a flattened `dosage` string to
 * reconstruct columns the importer had thrown away, which is why
 * export → import → export could not be guaranteed stable: the split was
 * guessed twice, by two different implementations. There is exactly one splitter
 * now (`domain/strength.ts`) and it runs once, at backfill time — by the time
 * anything reaches this module the answer is already in the row.
 */

export interface InventoryExportRow {
  category: string | null;
  daily: number[]; // length 31
  form: string;
  name: string;
  packSize: string;
  stockOnHand: number | null;
  stockRemaining: number | null;
  strengthUnit: string;
  strengthValue: string;
  supplier: string | null;
  totalDispensed: number | null;
}

export function buildInventoryXlsxRows(
  rows: InventoryExportRow[]
): (string | number | null)[][] {
  const header = [...INVENTORY_TEMPLATE_HEADERS] as string[];
  const out: (string | number | null)[][] = [header];
  for (const r of rows) {
    const daily =
      r.daily.length === 31
        ? r.daily
        : [...r.daily, ...new Array(31 - r.daily.length).fill(0)].slice(0, 31);
    const totalDispensed = r.totalDispensed ?? daily.reduce((a, b) => a + b, 0);
    const stockRemaining =
      r.stockRemaining ??
      (r.stockOnHand === null
        ? 0 - totalDispensed
        : r.stockOnHand - totalDispensed);
    out.push([
      r.name,
      r.strengthValue.trim(),
      r.strengthUnit.trim(),
      r.form.trim(),
      r.packSize.trim(),
      r.stockOnHand ?? "",
      ...daily.map((d) => (d === 0 ? "" : d)),
      totalDispensed,
      stockRemaining,
      r.category ?? "",
      r.supplier ?? "",
    ]);
  }
  // Pad to at least 100 data rows with formulas placeholder — but xlsx writer will not need formulas for empty rows, template already has them.
  return out;
}

/**
 * Builds the template workbook for `rows`.
 *
 * Exported (rather than only written to disk) so the export → import round trip
 * is testable, and so the totals cells below stay in one place.
 */
export function buildInventoryWorkbook(rows: InventoryExportRow[]) {
  const aoa = buildInventoryXlsxRows(rows);
  const ws = utils.aoa_to_sheet(aoa);

  // Column widths per spec
  const cols = [
    { wch: 28 }, // A name
    { wch: 14 }, // B
    { wch: 14 }, // C
    { wch: 16 }, // D
    { wch: 14 }, // E
    { wch: 16 }, // F
    ...new Array(31).fill({ wch: 6 } as const), // G-AK
    { wch: 16 }, // AL
    { wch: 16 }, // AM
    { wch: 18 }, // AN
    { wch: 20 }, // AO
  ];
  (ws as unknown as { "!cols": unknown })["!cols"] = cols;

  // Freeze A2, auto-filter, print title
  (ws as unknown as Record<string, unknown>)["!freeze"] = {
    activePane: "bottomRight",
    topLeftCell: "B2",
    xSplit: 1,
    ySplit: 1,
  };
  (ws as unknown as Record<string, unknown>)["!autofilter"] = { ref: "A1:AO1" };

  // AL/AM carry formulas so a human keeps the live-recalculating template, and
  // a cached value so the importer (which only reads cached results, not
  // formulas) gets the totals back instead of blanks on re-import (spec 4.6).
  const cells = ws as unknown as Record<
    string,
    { f: string; t: "n"; v: number }
  >;
  for (let r = 2; r <= aoa.length; r += 1) {
    const alAddr = utils.encode_cell({ c: 37, r: r - 1 }); // AL col 0-index 37
    const amAddr = utils.encode_cell({ c: 38, r: r - 1 });
    const nameCell = aoa[r - 1]?.[0];
    const total = aoa[r - 1]?.[37];
    const remaining = aoa[r - 1]?.[38];
    if (
      typeof nameCell === "string" &&
      nameCell.trim() !== "" &&
      typeof total === "number" &&
      typeof remaining === "number"
    ) {
      cells[alAddr] = { f: `SUM(G${r}:AK${r})`, t: "n", v: total };
      cells[amAddr] = {
        f: `IF(F${r}="",0,F${r})-AL${r}`,
        t: "n",
        v: remaining,
      };
    }
  }

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, "Inventory Template");
  return wb;
}

export function downloadInventoryXlsx(
  rows: InventoryExportRow[],
  fileName: string
): void {
  writeFile(buildInventoryWorkbook(rows), fileName);
}
