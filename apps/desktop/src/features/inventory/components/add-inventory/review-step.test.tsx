import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  type CreationDraft,
  newBatchDraftRow,
  newProductDraft,
} from "../../creation/draft";
import type { DraftIssue } from "../../creation/validate-draft";
import type { InventoryItem } from "../../types";
import { ReviewStep } from "./review-step";

const CREATE_ALL = /create all/i;
const EXISTING_QTY = /existing qty 40 → 100/;
const NOTES_BLANK = /Notes are blank\./;

const NEW_PRODUCT: CreationDraft = {
  additions: [],
  newProducts: [
    {
      ...newProductDraft(),
      batches: [
        newBatchDraftRow({
          batch: "B-2027-01",
          expiry: "2027-03-01",
          qty: 200,
        }),
        newBatchDraftRow({
          batch: "B-2027-02",
          expiry: "2027-05-01",
          qty: 200,
        }),
      ],
      category: "Analgesic",
      name: "Paracetamol",
      sku: "SKU-PARA-500",
      strengthUnit: "mg",
      strengthValue: "500",
      supplier: "MedSupply",
    },
  ],
};

const ITEM: InventoryItem = {
  batches: [
    {
      batch: "A-2026-01",
      expiry: "2026-12-01",
      qty: 40,
      supplier: "MedSupply",
    },
  ],
  category: "Antibiotic",
  detailsIncomplete: false,
  dispensingHistory: [],
  displayName: "Amoxicillin 250 mg capsule",
  expiry: "2026-12-01",
  form: "capsule",
  id: "item-1",
  name: "Amoxicillin",
  packSize: "",
  qty: 40,
  sku: "SKU-AMOX-250",
  status: "low",
  strengthUnit: "mg",
  strengthValue: "250",
  supplier: "MedSupply",
  threshold: 100,
};

function renderReview({
  draft = NEW_PRODUCT,
  items = [],
  validation = { errors: [], warnings: [] },
}: {
  draft?: CreationDraft;
  items?: InventoryItem[];
  validation?: { errors: DraftIssue[]; warnings: DraftIssue[] };
} = {}) {
  const onFix = vi.fn();
  const onSubmit = vi.fn();
  render(
    <ReviewStep
      draft={draft}
      items={items}
      onBack={vi.fn()}
      onFix={onFix}
      onSubmit={onSubmit}
      pending={false}
      validation={validation}
    />
  );
  return { onFix, onSubmit };
}

describe("ReviewStep", () => {
  it("lists every batch about to be created, with counts", async () => {
    const { onSubmit } = renderReview();

    expect(
      screen.getByText("1 product · 2 batches ready to create")
    ).toBeInTheDocument();
    expect(screen.getByText("batch B-2027-01")).toBeInTheDocument();
    expect(screen.getByText("200 units · exp Mar 2027")).toBeInTheDocument();

    const create = screen.getByRole("button", {
      name: "Create all (1 product, 2 batches)",
    });
    expect(create).toBeEnabled();
    await userEvent.click(create);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("shows what an addition does to the product's qty", () => {
    renderReview({
      draft: {
        additions: [
          {
            batches: [newBatchDraftRow({ batch: "B-2027-09", qty: 60 })],
            itemId: "item-1",
          },
        ],
        newProducts: [],
      },
      items: [ITEM],
    });

    expect(screen.getByText("Amoxicillin 250 mg capsule")).toBeInTheDocument();
    expect(screen.getByText(EXISTING_QTY)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create all (1 product, 1 batch)" })
    ).toBeInTheDocument();
  });

  it("lists warnings without blocking the write", () => {
    renderReview({
      validation: {
        errors: [],
        warnings: [{ field: "notes", message: "Notes are blank." }],
      },
    });

    expect(screen.getByText(NOTES_BLANK)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: CREATE_ALL })).toBeEnabled();
  });

  it("blocks the write on an error and leads back to the offending row", async () => {
    const issue: DraftIssue = {
      field: "batches.row-1.expiry",
      message: "Expiry must be after today.",
      rowId: "row-1",
    };
    const { onFix, onSubmit } = renderReview({
      validation: { errors: [issue], warnings: [] },
    });

    const create = screen.getByRole("button", { name: CREATE_ALL });
    expect(create).toBeDisabled();
    await userEvent.click(create);
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Expiry must be after today." })
    );
    expect(onFix).toHaveBeenCalledWith(issue);
  });
});
