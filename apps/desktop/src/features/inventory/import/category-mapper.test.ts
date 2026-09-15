import { describe, expect, it } from "vitest";
import { guessCategory } from "./category-mapper";

describe("guessCategory", () => {
  it("maps antibiotic keywords", () => {
    expect(guessCategory("Amoxicillin", "500mg cap")).toBe("Antibiotic");
    expect(guessCategory("Cefuroxime", "500 mg tab")).toBe("Antibiotic");
    expect(guessCategory("Azithromycin", "500 mg tab")).toBe("Antibiotic");
    expect(guessCategory("Ciprofloxacin HCL", "500mg tabs")).toBe("Antibiotic");
  });

  it("maps analgesic keywords", () => {
    expect(guessCategory("Paracetamol", "500mg tabs")).toBe("Analgesic");
    expect(guessCategory("Ibuprofen", "400mg tab")).toBe("Analgesic");
    expect(guessCategory("Mefenamic Acid ", "500mg caps")).toBe("Analgesic");
    expect(guessCategory("Celecoxib ", "200mg cap")).toBe("Analgesic");
  });

  it("maps supplement keywords", () => {
    expect(guessCategory("Ascorbic Acid + Zinc", "500 mg/10mg cap")).toBe(
      "Supplement"
    );
    expect(guessCategory("Multivitamins + Iron ", "Caps (100/box)")).toBe(
      "Supplement"
    );
    expect(guessCategory("Sodium Ascorbate ", "500 mg caps")).toBe(
      "Supplement"
    );
  });

  it("maps respiratory keywords", () => {
    expect(guessCategory("Salbutamol", "2.5ml nebule")).toBe("Respiratory");
    expect(guessCategory("Carbocisteine ", "500mg cap")).toBe("Respiratory");
    expect(guessCategory("Ambroxol HCl", "75mg cap")).toBe("Respiratory");
  });

  it("maps gastro and antiseptic and first aid", () => {
    expect(guessCategory("Omeprazole", "20mg caps")).toBe("Gastro");
    expect(guessCategory("Hyoscine-N-Butylbromide ", "10mg tabs")).toBe(
      "Gastro"
    );
    expect(guessCategory("Povidone Iodine 10% 60ml", "")).toBe("Antiseptic");
    expect(guessCategory("Gauze Pads 10x10", "")).toBe("First Aid");
  });

  it("returns null for uncategorized (e.g., Calcium Ascorbate ambiguous, Lidocaine)", () => {
    expect(
      guessCategory("Local anesthesia (Lidocaine) ", "50 ml vial")
    ).toBeNull();
    expect(guessCategory("UnknownMed XYZ", "10mg")).toBeNull();
  });

  it("is case-insensitive and trims", () => {
    expect(guessCategory("  amoxicillin ", " 500MG ")).toBe("Antibiotic");
  });

  it("combines name+dosage for matching", () => {
    // Salbutamol appears in dosage too
    expect(guessCategory("Guaifenesin + Salbutamol ", "100mg/2mg caps")).toBe(
      "Respiratory"
    );
  });
});
