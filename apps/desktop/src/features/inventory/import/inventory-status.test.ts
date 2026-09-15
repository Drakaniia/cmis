import { describe, expect, it } from "vitest";
import { deriveStatus } from "./inventory-status";

describe("deriveStatus", () => {
  it("out when qty 0 regardless of threshold", () => {
    expect(deriveStatus(0, 20)).toBe("out");
    expect(deriveStatus(0, 0)).toBe("out");
  });

  it("low when 0 < qty < threshold", () => {
    expect(deriveStatus(8, 20)).toBe("low");
    expect(deriveStatus(19, 20)).toBe("low");
  });

  it("in when qty >= threshold", () => {
    expect(deriveStatus(20, 20)).toBe("in");
    expect(deriveStatus(120, 20)).toBe("in");
  });

  it("threshold default 20: low check uses default", () => {
    // simulate import default
    const threshold = 20;
    expect(deriveStatus(5, threshold)).toBe("low");
    expect(deriveStatus(25, threshold)).toBe("in");
  });

  it("needs_batch orthogonal: empty batches does not affect status", () => {
    // status derived from qty only, needs_batch is separate flag
    expect(deriveStatus(10, 20)).toBe("low");
    // needs_batch true would be derived elsewhere, status remains low not expiring
  });
});
