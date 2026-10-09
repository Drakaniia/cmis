import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { RequestItem } from "../types";
import { EditRequestorModal } from "./edit-requestor-modal";

function makeItem(overrides: Partial<RequestItem> = {}): RequestItem {
  return {
    boardPosition: 0,
    category: "Analgesic",
    dispensingRecords: [],
    history: [],
    id: "REQ-2026-0001",
    medicine: "Paracetamol 500mg",
    notes: [],
    qty: 2,
    reason: "Headache after PE class.",
    requestor: {
      email: "maria.santos@bukidnon.edu",
      id: "STU-2024-0831",
      name: "Maria Santos",
    },
    source: "queue",
    status: "pending",
    submittedAt: new Date(Date.now() - 60_000).toISOString(),
    unit: "tabs",
    ...overrides,
  };
}

function renderModal(item: RequestItem = makeItem()) {
  const onOpenChange = vi.fn();
  const onSave = vi.fn();
  render(
    <EditRequestorModal
      item={item}
      onOpenChange={onOpenChange}
      onSave={onSave}
      open
    />
  );
  return { onOpenChange, onSave };
}

const NAME_PLACEHOLDER = "Walk-in";
const EMAIL_PLACEHOLDER = "name@example.edu";
const ID_PLACEHOLDER = "STU-2024-0831";

describe("EditRequestorModal", () => {
  it("starts from the stored requestor details", () => {
    renderModal();
    expect(screen.getByDisplayValue("Maria Santos")).toBeInTheDocument();
    expect(screen.getByDisplayValue("STU-2024-0831")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("maria.santos@bukidnon.edu")
    ).toBeInTheDocument();
  });

  it("saves the trimmed draft", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    await user.clear(screen.getByPlaceholderText(NAME_PLACEHOLDER));
    await user.type(
      screen.getByPlaceholderText(NAME_PLACEHOLDER),
      "  Ana Reyes  "
    );
    await user.click(screen.getByRole("button", { name: "Save details" }));

    expect(onSave).toHaveBeenCalledWith("REQ-2026-0001", {
      email: "maria.santos@bukidnon.edu",
      id: "STU-2024-0831",
      name: "Ana Reyes",
    });
  });

  it("accepts a blank requestor — anonymous is first-class", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    await user.clear(screen.getByPlaceholderText(NAME_PLACEHOLDER));
    await user.clear(screen.getByPlaceholderText(ID_PLACEHOLDER));
    await user.clear(screen.getByPlaceholderText(EMAIL_PLACEHOLDER));
    await user.click(screen.getByRole("button", { name: "Save details" }));

    expect(onSave).toHaveBeenCalledWith("REQ-2026-0001", {
      email: "",
      id: "",
      name: "",
    });
  });

  it("blocks a malformed email and reports why", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    await user.clear(screen.getByPlaceholderText(EMAIL_PLACEHOLDER));
    await user.type(screen.getByPlaceholderText(EMAIL_PLACEHOLDER), "nope");
    await user.click(screen.getByRole("button", { name: "Save details" }));

    expect(screen.getByRole("alert")).toHaveTextContent("valid email");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps Save disabled until something changes", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Save details" })).toBeDisabled();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderModal();
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
