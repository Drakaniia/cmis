import type { INVENTORY_CATEGORIES } from "../types";

type Category = (typeof INVENTORY_CATEGORIES)[number];

const KEYWORD_MAP: Array<{ category: Category; keywords: string[] }> = [
  {
    category: "Antibiotic",
    keywords: [
      "amoxicillin",
      "cefuroxime",
      "cefalexin",
      "azithromycin",
      "ciprofloxacin",
      "clindamycin",
      "cloxacillin",
      "co-amoxiclav",
      "co - amoxiclav",
      "metronidazole",
      "mupirocin",
      "fusidic",
    ],
  },
  {
    category: "Analgesic",
    keywords: [
      "paracetamol",
      "ibuprofen",
      "mefenamic",
      "celecoxib",
      "ketorolac",
      "tramadol",
      "diclofenac",
      "allopurinol",
      "colchicine",
      "betahistine",
    ],
  },
  {
    category: "Supplement",
    keywords: [
      "ascorbic",
      "multivitamin",
      "vitamin",
      "ferrous",
      "calcium",
      "sodium ascorbate",
      "zinc",
      "ors",
      "oral rehydrating",
    ],
  },
  {
    category: "Respiratory",
    keywords: [
      "salbutamol",
      "carbocisteine",
      "ambroxol",
      "budesonide",
      "butamirate",
      "guaifenesin",
      "levocetirizine",
      "cetirizine",
      "diphenhydramine",
      "ipratropium",
    ],
  },
  {
    category: "Gastro",
    keywords: [
      "omeprazole",
      "pantoprazole",
      "ranitidine",
      "hyoscine",
      "hyosine",
      "metoclopramide",
      "loperamide",
      "bisacodyl",
      "aluminum",
      "antacid",
      "domperidone",
    ],
  },
  {
    category: "Antiseptic",
    keywords: [
      "povidone",
      "alcohol",
      "chlorhexidine",
      "silver sulfadiazine",
      "betadine",
      "iodine",
    ],
  },
  {
    category: "First Aid",
    keywords: ["gauze", "bandage", "adhesive", "sterile water", "pnss"],
  },
];

/**
 * `name` plus the recomposed strength label — what the importer passes is the
 * four stored columns joined in template order, not a `dosage` string, but the
 * keywords are matched against the same text either way.
 */
export function guessCategory(
  name: string,
  strengthLabel: string
): Category | null {
  const haystack = `${name} ${strengthLabel}`.toLowerCase();
  for (const entry of KEYWORD_MAP) {
    for (const kw of entry.keywords) {
      if (haystack.includes(kw)) {
        return entry.category;
      }
    }
  }
  return null;
}
