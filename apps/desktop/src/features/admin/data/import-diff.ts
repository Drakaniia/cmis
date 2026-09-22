import type { ImportDiff, ImportSampleRow } from "./types";

function kindFromName(fileName: string): ImportDiff["kind"] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".json")) {
    return "json";
  }
  if (lower.endsWith(".db")) {
    return "db";
  }
  return "csv";
}

const CSV_LINE_SPLIT = /\r?\n/;

function csvRows(content: string): string[] {
  return content
    .trim()
    .split(CSV_LINE_SPLIT)
    .filter((line) => line.trim().length > 0);
}

function samplesFromRecords(
  records: { id: string; label: string }[],
  change: ImportSampleRow["change"] = "insert"
): ImportSampleRow[] {
  return records.slice(0, 5).map((record) => ({ change, ...record }));
}

/**
 * CMIS-UI-09 §4.3 — preview the diff without committing.
 *
 * In the desktop build this runs inside a read-only transaction that is rolled
 * back; the web build parses the file itself, which is enough to drive the same
 * confirm step. Never mutate store state from here.
 */
export function parseImportDiff(fileName: string, content: string): ImportDiff {
  const kind = kindFromName(fileName);

  if (kind === "db") {
    // A .db backup's contents cannot be counted without opening it, so the diff
    // reports no numbers at all rather than plausible-looking invented ones.
    // In the desktop app a .db never previews here at all — it is staged and
    // routed to the real Restore flow (Settings → Backup); this branch only
    // serves engines without that flow (the browser preview).
    return {
      counts: { deletes: 0, inserts: 0, updates: 0 },
      fileName,
      kind,
      sample: [],
      warnings: [
        "Restoring a backup replaces the current database entirely.",
        "Any stock changes recorded since the backup will be lost.",
        "Confirming here writes nothing — restore it from Settings → Backup → Restore from a backup….",
      ],
    };
  }

  if (kind === "json") {
    const records: { id: string; label: string }[] = [];
    let warning: string | undefined;
    try {
      const parsed: unknown = JSON.parse(content);
      if (Array.isArray(parsed)) {
        for (const entry of parsed.slice(0, 50)) {
          if (entry && typeof entry === "object") {
            const record = entry as Record<string, unknown>;
            records.push({
              id: String(record.id ?? record.sku ?? records.length),
              label: String(record.name ?? record.medicine ?? "Unnamed record"),
            });
          }
        }
      } else {
        warning = "JSON root is not an array — no records were detected.";
      }
    } catch {
      warning = "File is not valid JSON.";
    }

    return {
      counts: {
        deletes: 0,
        inserts: records.length,
        updates: 0,
      },
      fileName,
      kind,
      sample: samplesFromRecords(records),
      warnings: [
        ...(warning ? [warning] : []),
        `Import will add ${records.length} inventory rows, merging on id.`,
      ],
    };
  }

  const lines = csvRows(content);
  const dataLines = lines.slice(1);
  const records = dataLines.map((line, index) => {
    const cells = line.split(",");
    const id = (cells[0] ?? "").replaceAll('"', "").trim();
    const label = (cells[1] ?? cells[0] ?? "").replaceAll('"', "").trim();
    return { id: id || `row-${index}`, label: label || "Unnamed row" };
  });

  const warnings: string[] = [];
  if (lines.length === 0) {
    warnings.push("The file is empty — nothing will be imported.");
  } else if (dataLines.length === 0) {
    warnings.push("Only a header row was found — nothing will be imported.");
  } else {
    warnings.push(
      `Import will overwrite ${dataLines.length} inventory rows matched by SKU.`
    );
  }

  return {
    counts: {
      deletes: 0,
      inserts: dataLines.length,
      updates: 0,
    },
    fileName,
    kind,
    sample: samplesFromRecords(records),
    warnings,
  };
}
