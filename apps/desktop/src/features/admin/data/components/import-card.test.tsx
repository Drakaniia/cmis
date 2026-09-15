import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import { INVENTORY_TEMPLATE_HEADERS } from "@/features/inventory/import/csv-parser";
import { ImportCard } from "./import-card";

const INVENTORY_CSV = /Inventory CSV/i;
const CONFIRM_IMPORT = /Confirm import/i;
const OVERWRITE_PROMPT = /Overwrite current data\?/i;
const IMPORT_TEXT = /IMPORT/;
const INVALID_WORKBOOK = /not a valid Excel workbook/i;

function buildXlsxFilename(rows: (string | number | null)[][]): File {
  const headers = [...INVENTORY_TEMPLATE_HEADERS] as string[];
  const sheet = utils.aoa_to_sheet([headers, ...rows]);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, "Inventory");
  const bytes: ArrayBuffer = write(workbook, {
    bookType: "xlsx",
    type: "array",
  });
  return new File([bytes], "inventory.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function build41Row(input: {
  form?: string;
  name: string;
  packSize?: string;
  stockOnHand?: string | number | null;
  strengthUnit?: string;
  strengthValue?: string;
  totalDispensed?: string | number | null;
}): (string | number | null)[] {
  const daily = new Array(31).fill("");
  return [
    input.name,
    input.strengthValue ?? "",
    input.strengthUnit ?? "",
    input.form ?? "",
    input.packSize ?? "",
    input.stockOnHand ?? "",
    ...daily,
    input.totalDispensed ?? "",
    "",
    "",
    "",
  ];
}

describe("ImportCard — Excel import", () => {
  it("shows the inventory CSV preview when an xlsx file is chosen", async () => {
    const user = userEvent.setup();
    render(<ImportCard />);

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = buildXlsxFilename([
      build41Row({
        form: "tabs",
        name: "Paracetamol",
        packSize: "(100/tab)",
        stockOnHand: "120",
        strengthUnit: "mg",
        strengthValue: "500",
        totalDispensed: "0",
      }),
    ]);

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText("inventory.xlsx")).toBeInTheDocument();
    });
    expect(screen.getByText(INVENTORY_CSV)).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent === "+1 inserts" &&
          element?.className.includes("text-[var(--success)]")
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("Paracetamol 500 mg tabs (100/tab)")
    ).toBeInTheDocument();
  });

  it("stages the import so confirm opens the type-to-IMPORT modal", async () => {
    const user = userEvent.setup();
    render(<ImportCard />);

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(
      input,
      buildXlsxFilename([
        build41Row({
          form: "tabs",
          name: "Ascorbic Acid",
          stockOnHand: "50",
          strengthUnit: "mg",
          strengthValue: "100",
        }),
      ])
    );

    const confirmButton = await screen.findByRole("button", {
      name: CONFIRM_IMPORT,
    });
    await user.click(confirmButton);

    expect(screen.getByText(OVERWRITE_PROMPT)).toBeInTheDocument();
    expect(screen.getByText(IMPORT_TEXT)).toBeInTheDocument();
  });
  it("shows a preview error for a file that is not a real workbook", async () => {
    const user = userEvent.setup();
    render(<ImportCard />);

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const fake = new File([new Uint8Array([0, 1, 2, 3])], "fake.xlsx", {
      type: "application/octet-stream",
    });
    await user.upload(input, fake);

    await waitFor(() => {
      expect(screen.getByText(INVALID_WORKBOOK)).toBeInTheDocument();
    });
  });
});
