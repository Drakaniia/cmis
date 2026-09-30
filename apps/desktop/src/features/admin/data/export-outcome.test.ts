import { describe, expect, it } from "vitest";
import { type ExportAttempt, exportOutcome } from "./export-outcome";

describe("export-outcome", () => {
  it("reports failure when no file was written", () => {
    // The defect this guards: the invoke threw, the web fallback was not
    // eligible, and the card still showed a success toast naming a file that
    // was never created.
    const outcome = exportOutcome({
      format: "csv",
      nativePath: null,
      stamp: "2026-09-30",
      webFallbackDone: false,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.description).not.toMatch(/ready/i);
  });

  it("names the file when the native command wrote one", () => {
    const outcome = exportOutcome({
      format: "csv",
      nativePath: "C:/Users/clinic/Desktop/cmis-export.csv",
      stamp: "2026-09-30",
      webFallbackDone: false,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.description).toMatch(/C:\/Users\/clinic\/Desktop/);
  });

  it("accepts the browser fallback as a real written file", () => {
    const outcome = exportOutcome({
      format: "xlsx",
      nativePath: null,
      stamp: "2026-09-30",
      webFallbackDone: true,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.description).toMatch(/cmis-export-2026-09-30\.xlsx/);
  });

  it("explains which formats cannot be written", () => {
    // Requests and audit logs have no working exporter, so this must refuse
    // rather than imply a file exists.
    const outcome = exportOutcome({
      format: "json",
      nativePath: null,
      stamp: "2026-09-30",
      webFallbackDone: false,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.description).toMatch(/no file was written/i);
  });

  it("never claims success for a format with no writer", () => {
    for (const format of ["csv", "json"] as const) {
      const outcome = exportOutcome({
        format,
        nativePath: null,
        stamp: "2026-09-30",
        webFallbackDone: false,
      });
      expect(outcome.ok).toBe(false);
    }
  });
});

describe("export-attempt shape", () => {
  it("treats a non-string invoke result as no file", () => {
    // `invoke` is typed as returning a string, but a command returning null or
    // undefined must not be read as a path.
    const attempt: ExportAttempt = { nativePath: null };
    expect(
      exportOutcome({
        ...attempt,
        format: "csv",
        stamp: "x",
        webFallbackDone: false,
      }).ok
    ).toBe(false);
  });
});
