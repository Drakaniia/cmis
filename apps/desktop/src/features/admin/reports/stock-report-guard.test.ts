import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The stock-level-report spec deletes the fake Import button, the CSV export and
 * the placeholder PDF export outright (D28). This guard keeps them deleted: it
 * scans the Reports feature's own source for the removed modules and labels, so
 * a later change cannot quietly reintroduce a control that pretends to work.
 */

const REPORTS_DIR = join(process.cwd(), "src/features/admin/reports");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => [".ts", ".tsx"].includes(extname(path)))
    .filter(
      (path) => !(path.endsWith(".test.ts") || path.endsWith(".test.tsx"))
    );
}

describe("stock report guard", () => {
  const sources = sourceFiles(REPORTS_DIR).map((path) => ({
    path,
    text: readFileSync(path, "utf8"),
  }));

  it("has source to scan", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it("imports none of the deleted modules", () => {
    for (const { path, text } of sources) {
      expect(text, path).not.toContain("export-reports");
      expect(text, path).not.toContain("use-reports-filters");
      expect(text, path).not.toContain("hooks/use-reports");
    }
  });

  it("renders no Import / Export CSV / Export PDF control", () => {
    for (const { path, text } of sources) {
      expect(text, path).not.toContain("Export CSV");
      expect(text, path).not.toContain("Export PDF");
      expect(text, path).not.toContain("handleImportFile");
      expect(text, path).not.toContain("handleImportClick");
    }
  });
});
