import { describe, expect, it } from "vitest";

import { formatRequestId, nextRequestId } from "./request-id";

describe("formatRequestId", () => {
  it("pads the sequence to four digits", () => {
    expect(formatRequestId(2026, 1)).toBe("REQ-2026-0001");
    expect(formatRequestId(2026, 141)).toBe("REQ-2026-0141");
  });
});

describe("nextRequestId", () => {
  it("starts a fresh table at 0001", () => {
    expect(nextRequestId([], 2026)).toBe("REQ-2026-0001");
  });

  it("continues after the highest reference for the year", () => {
    expect(
      nextRequestId(["REQ-2026-0001", "REQ-2026-0002", "REQ-2026-0010"], 2026)
    ).toBe("REQ-2026-0011");
  });

  it("ignores other years", () => {
    expect(nextRequestId(["REQ-2025-0042"], 2026)).toBe("REQ-2026-0001");
    expect(nextRequestId(["REQ-2025-0042"], 2025)).toBe("REQ-2025-0043");
  });

  it("ignores ids that do not follow the format", () => {
    expect(nextRequestId(["REQ-001", "OTHER", "REQ-2026-0003"], 2026)).toBe(
      "REQ-2026-0004"
    );
  });

  it("never returns a reference that is already in use", () => {
    const taken = ["REQ-2026-0001", "REQ-2026-0002", "REQ-2026-0003"];
    expect(taken).not.toContain(nextRequestId(taken, 2026));
  });

  it("keeps ids parseable past the 9999th request of a year", () => {
    expect(nextRequestId(["REQ-2026-9999"], 2026)).toBe("REQ-2026-10000");
  });
});
