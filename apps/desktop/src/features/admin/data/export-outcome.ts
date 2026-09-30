/**
 * What the Export card is allowed to tell the operator.
 *
 * The card used to show `Export ready — <file>` unconditionally, even when the
 * `export_data` command did not exist, the invoke threw, and no file had been
 * written. An operator who exported their data, saw a green toast, and then
 * retired the machine had lost it. So the outcome is decided here, from what
 * actually happened, and the card can only render what this returns.
 */

import type { ExportFormat } from "./types";

/** The result of trying to invoke a native writer, if any. */
export interface ExportAttempt {
  /** Path the native command reported, or null when it wrote nothing. */
  nativePath: string | null;
}

export interface ExportOutcomeInput extends ExportAttempt {
  format: ExportFormat;
  /** `YYYY-MM-DD` used in generated file names. */
  stamp: string;
  /** The browser fallback actually produced a file. */
  webFallbackDone: boolean;
}

export interface ExportOutcome {
  description: string;
  ok: boolean;
}

/** Which formats currently have a writer that produces a real file. */
const WRITTEN_FORMATS = new Set<ExportFormat>(["xlsx"]);

export function exportOutcome({
  format,
  nativePath,
  stamp,
  webFallbackDone,
}: ExportOutcomeInput): ExportOutcome {
  // A native path is proof a file exists — trust it over anything else.
  if (typeof nativePath === "string" && nativePath.length > 0) {
    return { description: `Saved to ${nativePath}`, ok: true };
  }
  if (webFallbackDone) {
    return {
      description: `cmis-export-${stamp}.${format}`,
      ok: true,
    };
  }
  // Nothing was written. Say so, and name the formats that do work so the
  // operator is not left guessing.
  const supported = [...WRITTEN_FORMATS].join(", ").toUpperCase();
  return {
    description: `No file was written. ${format.toUpperCase()} export is not available yet — use ${supported}, or take a database backup from Settings → Backup.`,
    ok: false,
  };
}
