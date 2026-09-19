import { newBatchDraftRow, newProductDraft, type ProductDraft } from "./draft";
import { applyDefaultFields, sheetGroupFromProduct } from "./sheet-defaults";
import {
  SHEET_DEFAULT_FIELDS,
  type SheetDefaults,
  type SheetGroup,
} from "./sheet-types";

/**
 * The delivery sheet's columns and its paste parser (spec §7.4).
 *
 * The column list is deliberately **one** definition: the grid renders it, the
 * `Paste rows` dialog maps against it, and a headerless paste reads by position
 * in the same order. Three copies of "what column is what" is how a paste ends
 * up silently landing quantities in the pack-size field.
 */

export type SheetColumnKey =
  | "name"
  | "batch"
  | "expiry"
  | "qty"
  | "sku"
  | "category"
  | "strengthValue"
  | "strengthUnit"
  | "form"
  | "packSize"
  | "supplier"
  | "threshold"
  | "notes";

export interface SheetColumn {
  /** Lower-cased header spellings the operator's file might use. */
  aliases: readonly string[];
  /** Frozen to the left of the horizontal scroll (§7.4). */
  frozen: boolean;
  key: SheetColumnKey;
  label: string;
  /** px — fixed so the frozen offsets are known without measuring. */
  width: number;
}

export const SHEET_COLUMNS: readonly SheetColumn[] = [
  {
    aliases: ["product", "product name", "medicine", "medicine name", "item"],
    frozen: true,
    key: "name",
    label: "Product name",
    width: 220,
  },
  {
    aliases: ["batch", "lot", "lot no", "batch no", "batch/lot", "lot number"],
    frozen: true,
    key: "batch",
    label: "Batch / Lot",
    width: 130,
  },
  {
    aliases: ["expiry", "expiry date", "exp", "exp date", "expires"],
    frozen: true,
    key: "expiry",
    label: "Expiry",
    width: 130,
  },
  {
    aliases: ["qty", "quantity", "amount", "count"],
    frozen: true,
    key: "qty",
    label: "Qty",
    width: 88,
  },
  {
    aliases: ["sku", "stock code", "code", "item code"],
    frozen: false,
    key: "sku",
    label: "SKU",
    width: 140,
  },
  {
    aliases: ["category", "group", "class"],
    frozen: false,
    key: "category",
    label: "Category",
    width: 150,
  },
  {
    aliases: ["strength", "strength value", "dose", "dosage"],
    frozen: false,
    key: "strengthValue",
    label: "Strength",
    width: 90,
  },
  {
    aliases: ["unit", "strength unit", "uom"],
    frozen: false,
    key: "strengthUnit",
    label: "Unit",
    width: 92,
  },
  {
    aliases: ["form", "dose form", "type", "presentation"],
    frozen: false,
    key: "form",
    label: "Form",
    width: 112,
  },
  {
    aliases: ["pack", "pack size", "packsize", "size"],
    frozen: false,
    key: "packSize",
    label: "Pack size",
    width: 96,
  },
  {
    aliases: ["supplier", "vendor", "manufacturer"],
    frozen: false,
    key: "supplier",
    label: "Supplier",
    width: 150,
  },
  {
    aliases: ["threshold", "low stock", "reorder", "reorder level"],
    frozen: false,
    key: "threshold",
    label: "Threshold",
    width: 96,
  },
  {
    aliases: ["notes", "note", "comment", "comments"],
    frozen: false,
    key: "notes",
    label: "Notes",
    width: 180,
  },
];

/** Total width of the grid's scrollable content, in px. */
export const SHEET_CONTENT_WIDTH = SHEET_COLUMNS.reduce(
  (sum, column) => sum + column.width,
  0
);

/** Left offset of a column, for the frozen cells' `position: sticky`. */
export function frozenOffset(index: number): number {
  return SHEET_COLUMNS.slice(0, index).reduce(
    (sum, column) => sum + column.width,
    0
  );
}

const HEADER_NOISE_RE = /[^a-z0-9]+/g;
const EDGE_DASH_RE = /^-|-$/g;
/** `""` inside a quoted cell means one literal quote, so it is parked first. */
const QUOTE_ESCAPE = "\u0000";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const ISO_MONTH_RE = /^(\d{4})-(\d{1,2})$/;
const SLASHED_DATE_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
const DIGITS_RE = /\D/g;

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(HEADER_NOISE_RE, "-")
    .replace(EDGE_DASH_RE, "");
}

function aliasSet(column: SheetColumn): Set<string> {
  return new Set(
    [column.label, column.key, ...column.aliases].map(normalizeHeader)
  );
}

const COLUMN_ALIASES = new Map(
  SHEET_COLUMNS.map((column) => [column.key, aliasSet(column)])
);

export function columnFor(header: string): SheetColumn | null {
  const normalized = normalizeHeader(header);
  if (normalized === "") {
    return null;
  }
  return (
    SHEET_COLUMNS.find((column) =>
      COLUMN_ALIASES.get(column.key)?.has(normalized)
    ) ?? null
  );
}

export type SheetMapping = Partial<Record<SheetColumnKey, number>>;

export interface ParsedPaste {
  /** The header cells, when the first line was one. */
  headers: string[] | null;
  /** Field → index into each row. */
  mapping: SheetMapping;
  rows: string[][];
  /** Header cells no column could claim (reported, never guessed at). */
  unmappedHeaders: string[];
}

/** By position: the paste is read in the order the grid renders its columns. */
export function positionalMapping(): SheetMapping {
  const mapping: SheetMapping = {};
  SHEET_COLUMNS.forEach((column, index) => {
    mapping[column.key] = index;
  });
  return mapping;
}

export function mappingFromHeaders(headers: string[]): {
  mapping: SheetMapping;
  unmappedHeaders: string[];
} {
  const mapping: SheetMapping = {};
  const unmappedHeaders: string[] = [];
  headers.forEach((header, index) => {
    const column = columnFor(header);
    if (column && mapping[column.key] === undefined) {
      mapping[column.key] = index;
      return;
    }
    if (header.trim() !== "") {
      unmappedHeaders.push(header.trim());
    }
  });
  return { mapping, unmappedHeaders };
}

/**
 * Quote-aware for both tab- and comma-separated text, because the two inputs
 * that reach this box are "copied from a spreadsheet" and "copied from a CSV".
 */
export function splitCells(line: string, delimiter: string): string[] {
  const text = line.replace(/""/g, QUOTE_ESCAPE);
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of text) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.replaceAll(QUOTE_ESCAPE, '"').trim());
}

/**
 * One recognised header is enough to read the first line as a header: a data
 * row carries a lot number and a quantity, which are not header aliases.
 */
const HEADER_MATCH_THRESHOLD = 1;

export function parsePaste(text: string): ParsedPaste {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");
  const delimiter = text.includes("\t") ? "\t" : ",";
  const cells = lines.map((line) => splitCells(line, delimiter));
  const [first, ...rest] = cells;
  const headerMatch = first
    ? mappingFromHeaders(first)
    : { mapping: {}, unmappedHeaders: [] };
  const matched = Object.keys(headerMatch.mapping).length;

  if (first && matched >= HEADER_MATCH_THRESHOLD) {
    return {
      headers: first,
      mapping: headerMatch.mapping,
      rows: rest,
      unmappedHeaders: headerMatch.unmappedHeaders,
    };
  }
  return {
    headers: null,
    mapping: positionalMapping(),
    rows: cells,
    unmappedHeaders: [],
  };
}

function cellReader(
  row: string[],
  mapping: SheetMapping
): (key: SheetColumnKey) => string {
  return (key) => {
    const index = mapping[key];
    return index === undefined ? "" : (row[index] ?? "");
  };
}

function parseCount(value: string): number | "" {
  const digits = value.replace(DIGITS_RE, "");
  return digits === "" ? "" : Number(digits);
}

/**
 * Pasted dates arrive in whatever the operator's spreadsheet showed. The
 * unambiguous shapes are converted to ISO; anything else is passed through
 * untouched, so validation reports it rather than a guess landing as a date.
 * Ambiguous `01/03/2027` is read as the app's own default format (MM/DD/YYYY).
 */
export function normalizePasteDate(value: string): string {
  const text = value.trim();
  if (text === "") {
    return "";
  }
  if (ISO_DATE_RE.test(text)) {
    return text.slice(0, 10);
  }
  const month = ISO_MONTH_RE.exec(text);
  if (month) {
    return `${month[1]}-${month[2].padStart(2, "0")}-01`;
  }
  const slashed = SLASHED_DATE_RE.exec(text);
  if (slashed) {
    return `${slashed[3]}-${slashed[1].padStart(2, "0")}-${slashed[2].padStart(2, "0")}`;
  }
  return text;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Rows sharing a product's identity collapse into one group, so a delivery
 * typed as one line per lot — which is how a delivery sheet is actually
 * written — arrives as "one product, N batches" rather than N products.
 */
function productKeyOf(reader: (key: SheetColumnKey) => string): string {
  return [
    reader("name"),
    reader("sku"),
    reader("strengthValue"),
    reader("strengthUnit"),
    reader("form"),
    reader("packSize"),
  ]
    .map(normalizeKey)
    .join("|");
}

export interface PasteOutcome {
  groups: SheetGroup[];
  rows: number;
  unmappedHeaders: string[];
}

export function groupsFromPaste(
  parsed: ParsedPaste,
  defaults: SheetDefaults
): PasteOutcome {
  const groups: SheetGroup[] = [];
  const indexByKey = new Map<string, number>();

  for (const row of parsed.rows) {
    const reader = cellReader(row, parsed.mapping);
    const name = reader("name").trim();
    const batch = reader("batch").trim();
    const qty = reader("qty").trim();
    if (name === "" && batch === "" && qty === "") {
      continue;
    }

    const batchRow = newBatchDraftRow({
      batch,
      expiry: normalizePasteDate(reader("expiry")),
      notes: reader("notes").trim(),
      qty: parseCount(qty),
      supplier: reader("supplier").trim(),
    });
    const key = productKeyOf(reader);
    let groupIndex = indexByKey.get(key);
    if (groupIndex === undefined) {
      const sku = reader("sku").trim();
      const pasted: Partial<ProductDraft> = {
        category: reader("category").trim(),
        form: reader("form").trim(),
        name,
        packSize: reader("packSize").trim(),
        sku,
        strengthUnit: reader("strengthUnit").trim(),
        strengthValue: reader("strengthValue").trim(),
        supplier: reader("supplier").trim(),
      };
      const threshold = parseCount(reader("threshold"));
      if (threshold !== "") {
        pasted.threshold = threshold;
      }
      // The file speaks first; the stencil fills only the columns it left blank.
      const explicit = withoutBlanks(pasted);
      const product: ProductDraft = applyDefaultFields(
        {
          ...newProductDraft(),
          ...explicit,
          // The stencil seeds one blank row; a pasted group brings its own.
          batches: [],
        },
        defaults,
        SHEET_DEFAULT_FIELDS.filter((field) => !(field in explicit))
      );
      groups.push(
        sheetGroupFromProduct(
          { ...product, batches: [batchRow] },
          {
            // Only what the file actually carried counts as the operator's own.
            overridden: SHEET_DEFAULT_FIELDS.filter(
              (field) => field in explicit
            ),
            skuTouched: sku !== "",
          }
        )
      );
      groupIndex = groups.length - 1;
      indexByKey.set(key, groupIndex);
    } else {
      const group = groups[groupIndex];
      groups[groupIndex] = {
        ...group,
        product: {
          ...group.product,
          batches: [...group.product.batches, batchRow],
        },
      };
    }
  }

  return {
    groups,
    rows: parsed.rows.length,
    unmappedHeaders: parsed.unmappedHeaders,
  };
}

/** Drops the empty strings a sparse paste leaves behind, so defaults survive. */
function withoutBlanks(values: Partial<ProductDraft>): Partial<ProductDraft> {
  const next: Partial<ProductDraft> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string" && value.trim() === "") {
      continue;
    }
    Object.assign(next, { [key]: value });
  }
  return next;
}
