import { describe, expect, it } from "vitest";
import { newBatchDraftRow, newProductDraft } from "./draft";
import {
  addSheetGroup,
  applyDefaultsToGroups,
  duplicateSheetGroup,
  groupsToDraft,
  moveSheetGroup,
  patchSheetGroup,
  removeSheetGroup,
  reorderSheetGroups,
  sheetTotals,
} from "./sheet";
import {
  applyDefaultFields,
  emptySheetDefaults,
  newSheetGroup,
  sheetGroupFromProduct,
} from "./sheet-defaults";
import type { SheetDefaults, SheetGroup } from "./sheet-types";
import { validateSheet } from "./sheet-validation";
import type { IdentityMatch } from "./validate-draft";

const STENCIL: SheetDefaults = {
  category: "Analgesic",
  form: "tablet",
  strengthUnit: "mg",
  supplier: "MedSupply",
  threshold: 30,
};

const BLANK: SheetDefaults = emptySheetDefaults();

/** A group with a complete first batch, stamped with `defaults`. */
function filled(
  defaults: SheetDefaults,
  seed: { name?: string; sku?: string; qty?: number } = {}
): SheetGroup {
  const product = applyDefaultFields(
    {
      ...newProductDraft(),
      batches: [
        newBatchDraftRow({
          batch: "B-2027-01",
          expiry: "2027-03-01",
          qty: seed.qty ?? 200,
        }),
      ],
      name: seed.name ?? "Paracetamol",
      sku: seed.sku ?? "SKU-PARA-500",
    },
    defaults
  );
  return sheetGroupFromProduct(product);
}

function identity(name: string, sku: string): IdentityMatch {
  return { id: `item-${sku}`, name, sku };
}

describe("sheet defaults", () => {
  it("stamps the stencil onto a new group only", () => {
    const existing = filled(BLANK, { sku: "SKU-PARA-500" });
    const { groups } = addSheetGroup([existing], STENCIL);

    expect(groups).toHaveLength(2);
    expect(groups[0].product.category).toBe("");
    expect(groups[0].product.threshold).toBe(20);
    expect(groups[1].product).toMatchObject({
      category: "Analgesic",
      form: "tablet",
      strengthUnit: "mg",
      supplier: "MedSupply",
      threshold: 30,
    });
  });

  it("leaves a fresh group's own defaults alone when the stencil is blank", () => {
    const group = newSheetGroup(BLANK);
    expect(group.product.threshold).toBe(20);
    expect(group.overridden).toEqual([]);
  });

  it("marks a shared-default field the operator typed on", () => {
    const group = filled(BLANK);
    const [patched] = patchSheetGroup([group], group.id, {
      category: "Antibiotic",
    });

    expect(patched.overridden).toEqual(["category"]);
    expect(
      patchSheetGroup([patched], group.id, { name: "Amoxicillin" })[0]
        .overridden
    ).toEqual(["category"]);
  });
});

describe("applyDefaultsToGroups", () => {
  const groups = [
    filled(BLANK, { name: "Paracetamol", sku: "SKU-PARA-500" }),
    filled(BLANK, { name: "Cetirizine", sku: "SKU-CETI-10" }),
  ];
  const marked = [
    { ...groups[0], overridden: ["category"] as const },
    groups[1],
  ] as SheetGroup[];

  it("re-stamps the selected groups and clears their override markers", () => {
    const next = applyDefaultsToGroups(marked, [marked[0].id], STENCIL);

    expect(next[0].product).toMatchObject({
      category: "Analgesic",
      form: "tablet",
      supplier: "MedSupply",
      threshold: 30,
    });
    expect(next[0].overridden).toEqual([]);
    // The unselected group is untouched, marker and all.
    expect(next[1].product.category).toBe("");
    expect(next[1].product.threshold).toBe(20);
  });

  it("applies one field at a time", () => {
    const next = applyDefaultsToGroups(marked, [marked[0].id], STENCIL, [
      "supplier",
    ]);

    expect(next[0].product.supplier).toBe("MedSupply");
    expect(next[0].product.category).toBe("");
    // Only the applied field's marker clears; the rest stay marked.
    expect(next[0].overridden).toEqual(["category"]);
  });

  it("never wipes a value with a blank stencil field", () => {
    const typed = patchSheetGroup(groups, groups[0].id, {
      supplier: "KefCare",
    });
    const next = applyDefaultsToGroups(typed, [typed[0].id], BLANK, [
      "supplier",
    ]);

    expect(next[0].product.supplier).toBe("KefCare");
  });
});

describe("sheet group actions", () => {
  it("duplicates structure but not identity or lot numbers", () => {
    const group = filled(STENCIL);
    const { group: copy, groups } = duplicateSheetGroup([group], group.id);

    expect(groups).toHaveLength(2);
    expect(copy?.product.name).toBe("");
    expect(copy?.product.sku).toBe("");
    expect(copy?.product.category).toBe("Analgesic");
    expect(copy?.product.batches).toHaveLength(1);
    expect(copy?.product.batches[0].batch).toBe("");
    expect(copy?.product.batches[0].qty).toBe(200);
    expect(copy?.product.batches[0].id).not.toBe(group.product.batches[0].id);
  });

  it("removes and reorders groups", () => {
    const a = filled(BLANK, { name: "A", sku: "SKU-A" });
    const b = filled(BLANK, { name: "B", sku: "SKU-B" });
    const c = filled(BLANK, { name: "C", sku: "SKU-C" });

    expect(
      moveSheetGroup([a, b, c], c.id, -1).map((g) => g.product.name)
    ).toEqual(["A", "C", "B"]);
    expect(
      reorderSheetGroups([a, b, c], c.id, a.id).map((g) => g.product.name)
    ).toEqual(["C", "A", "B"]);
    expect(
      removeSheetGroup([a, b, c], b.id).map((g) => g.product.name)
    ).toEqual(["A", "C"]);
  });

  it("totals groups, batches and units, skipping blank rows", () => {
    const group = filled(BLANK, { qty: 200 });
    const withBlankRow = {
      ...group,
      product: {
        ...group.product,
        batches: [...group.product.batches, newBatchDraftRow()],
        zeroStock: true,
      },
    };

    expect(sheetTotals([withBlankRow])).toEqual({
      batches: 1,
      groups: 1,
      units: 200,
    });
    expect(groupsToDraft([group]).newProducts).toHaveLength(1);
  });
});

describe("validateSheet", () => {
  it("accepts distinct products", () => {
    const groups = [
      filled(STENCIL, { name: "Paracetamol", sku: "SKU-PARA-500" }),
      filled(STENCIL, { name: "Cetirizine", sku: "SKU-CETI-10" }),
    ];
    const validation = validateSheet(groups, { skus: new Set() });
    expect(validation.errors).toEqual([]);
  });

  it("blocks a SKU used by an earlier group on the sheet", () => {
    const groups = [
      filled(STENCIL, { name: "Paracetamol", sku: "SKU-PARA-500" }),
      filled(STENCIL, { name: "Cetirizine", sku: "SKU-PARA-500" }),
    ];
    const validation = validateSheet(groups, { skus: new Set() });
    const duplicate = validation.errors.find((issue) =>
      issue.message.includes("already used by group 1")
    );

    expect(duplicate?.message).toBe(
      "SKU-PARA-500 is already used by group 1 on this sheet."
    );
    expect(duplicate?.groupId).toBe(groups[1].id);
  });

  it("blocks one medicine repeated twice on the sheet", () => {
    const groups = [
      filled(STENCIL, { name: "Paracetamol", sku: "SKU-PARA-500" }),
      filled(STENCIL, { name: "paracetamol", sku: "SKU-PARA-501" }),
    ];
    const validation = validateSheet(groups, { skus: new Set() });

    expect(
      validation.errors.some((issue) =>
        issue.message.includes("same medicine as group 1")
      )
    ).toBe(true);
  });

  it("blocks a group whose medicine is already in inventory", () => {
    // `name|strength_value|strength_unit|form|pack_size` — the importer's own
    // identity key (spec §10.1, decision 9). This group is filled from the blank
    // stencil, so every strength part is empty and the key is name-only: a
    // medicine with no recorded composition still collides with itself.
    const identities = new Map<string, IdentityMatch>([
      ["paracetamol||||", identity("Paracetamol", "SKU-PARA-500")],
    ]);
    const groups = [filled(BLANK)];
    const validation = validateSheet(groups, { identities, skus: new Set() });
    const messages = validation.errors.map((issue) => issue.message);

    expect(
      messages.some((message) => message.includes("is already in inventory"))
    ).toBe(true);
    expect(messages.some((message) => message.includes("SKU-PARA-500"))).toBe(
      true
    );
  });
});
