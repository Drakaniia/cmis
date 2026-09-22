import { describe, expect, it } from "vitest";
import { inspectionMessage, isRestorable } from "./backup-inspection";

describe("backup-inspection", () => {
  it("maps every refusal code to its operator sentence", () => {
    expect(inspectionMessage("ok")).toBe("");
    expect(inspectionMessage("damaged")).toMatch(/damaged/i);
    expect(inspectionMessage("damaged")).toMatch(/integrity check/i);
    expect(inspectionMessage("newer-version")).toMatch(/newer version/i);
    expect(inspectionMessage("not-cmis")).toMatch(/not a CMIS backup/i);
    expect(inspectionMessage("not-database")).toMatch(/not a CMIS backup/i);
  });

  it("falls back to a generic refusal for an unknown code", () => {
    expect(inspectionMessage("bogus")).toMatch(/cannot be restored/i);
  });

  it("gates the confirm step on ok only", () => {
    expect(isRestorable({ ok: true })).toBe(true);
    expect(isRestorable({ ok: false })).toBe(false);
  });
});
