import { describe, expect, it } from "vitest";
import { deriveSku } from "./sku";

const SKU_FALLBACK = /^SKU-[A-F0-9]{8}$/;

describe("deriveSku", () => {
  it("derives SKU-ACET-600 from Acetylcysteine 600 mg sachet", () => {
    expect(deriveSku("Acetylcysteine", "600 mg sachet (10/box)")).toBe(
      "SKU-ACET-600"
    );
  });

  it("derives SKU-CET-10 from Cetirizine 10mg", () => {
    expect(deriveSku("Cetirizine ", "10mg tabs (100/box)")).toBe("SKU-CET-10");
  });

  it("handles dosage with comma and extracts first number", () => {
    expect(deriveSku("Ascorbic Acid Syrup", "100mg/5ml,120 ml")).toBe(
      "SKU-ASCO-100"
    );
  });

  it("handles collision suffix -2", () => {
    const existing = new Set(["SKU-ACET-600"]);
    expect(
      deriveSku("Acetylcysteine", "600 mg sachet (10/box)", existing)
    ).toBe("SKU-ACET-600-2");
  });

  it("fallback to uuid fragment when name too short / non-ascii", () => {
    const sku = deriveSku("A", "10mg");
    expect(sku).toMatch(SKU_FALLBACK);
  });

  it("blank dosage yields SKU without strength suffix", () => {
    expect(deriveSku("Ciprofloxacin", "")).toBe("SKU-CIPR");
  });

  it("is deterministic: same input gives same sku", () => {
    expect(deriveSku("Paracetamol", "500mg tabs")).toBe(
      deriveSku("Paracetamol", "500mg tabs")
    );
  });
});
