import { read, utils } from "xlsx";
import { parseInventoryCsv } from "./csv-parser";
import type { ParseResult } from "./types";

const XLSX_ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" — every .xlsx is a ZIP

export type XlsxInput = ArrayBuffer | Uint8Array;

/**
 * Excel seam: read an inventory workbook (.xlsx) and reuse the exact CSV
 * pipeline — the workbook is converted to CSV text (first sheet wins, matching
 * the single-sheet exports this clinic produces) and fed to parseInventoryCsv,
 * so warnings, coercion and mismatch semantics cannot drift between formats.
 */
export function parseInventoryXlsx(
  data: XlsxInput,
  month = "2026-08"
): ParseResult {
  return parseInventoryCsv(inventoryXlsxToCsv(data), month);
}

/**
 * Converts a workbook's first sheet to the CSV text parseInventoryCsv consumes.
 * Exported so the import UI can preview and stage the identical text it will
 * commit, without re-serializing between preview and confirm.
 */
export function inventoryXlsxToCsv(data: XlsxInput): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  if (
    bytes.length < XLSX_ZIP_MAGIC.length ||
    XLSX_ZIP_MAGIC.some((b, i) => bytes[i] !== b)
  ) {
    throw new Error(
      "This file is not a valid Excel workbook (.xlsx). Pick the workbook exported from Excel."
    );
  }

  let workbook: ReturnType<typeof read>;
  try {
    workbook = read(bytes, { type: "array" });
  } catch (err) {
    throw new Error(
      `Could not read the file as an Excel workbook (.xlsx): ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err }
    );
  }

  const [firstSheetName] = workbook.SheetNames;
  if (!firstSheetName) {
    throw new Error("The workbook has no sheets to import.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    throw new Error(`Workbook sheet "${firstSheetName}" is missing.`);
  }

  return utils.sheet_to_csv(sheet);
}
