import { describe, expect, it } from "vitest";

import { parseImportDiff } from "./import-diff";

describe("parseImportDiff", () => {
  it("counts CSV data rows after the header", () => {
    const csv = ["sku,name,qty", "SKU-1,A,10", "SKU-2,B,20"].join("\n");
    const diff = parseImportDiff("inventory.csv", csv);
    expect(diff.kind).toBe("csv");
    expect(diff.counts.inserts).toBe(2);
    expect(diff.sample).toHaveLength(2);
    expect(diff.sample[0]).toMatchObject({ id: "SKU-1", label: "A" });
    expect(diff.warnings.join(" ")).toContain("overwrite 2 inventory rows");
  });

  it("flags an empty file instead of silently importing nothing", () => {
    const diff = parseImportDiff("empty.csv", "");
    expect(diff.counts.inserts).toBe(0);
    expect(diff.warnings.join(" ")).toContain("empty");
  });

  it("parses JSON arrays into insert counts and samples", () => {
    const json = JSON.stringify([
      { id: "inv-1", name: "Amoxicillin" },
      { id: "inv-2", name: "ORS Sachet" },
    ]);
    const diff = parseImportDiff("items.json", json);
    expect(diff.kind).toBe("json");
    expect(diff.counts.inserts).toBe(2);
    expect(diff.sample.map((row) => row.id)).toEqual(["inv-1", "inv-2"]);
  });

  it("reports malformed JSON as a warning, not a crash", () => {
    const diff = parseImportDiff("broken.json", "{not json");
    expect(diff.counts.inserts).toBe(0);
    expect(diff.warnings.join(" ")).toContain("not valid JSON");
  });

  it("warns that a .db import replaces the whole database", () => {
    const diff = parseImportDiff("backup.db", "binary-ish");
    expect(diff.kind).toBe("db");
    expect(diff.warnings.join(" ")).toContain("replaces the current database");
    expect(diff.counts.deletes).toBeGreaterThan(0);
  });
});
