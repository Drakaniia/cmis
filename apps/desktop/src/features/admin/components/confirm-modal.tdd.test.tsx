import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmModal } from "./confirm-modal";

const COPY_IMPORT = /Copy IMPORT/i;
const IMPORT_AND_OVERWRITE = /Import and overwrite/i;
const CONFIRM = /Confirm/i;

describe("ConfirmModal — TDD for copy button + pale destructive button", () => {
  it("shows a Copy button beside the type-to-confirm text", () => {
    render(
      <ConfirmModal
        confirmLabel="Import and overwrite"
        destructive
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open
        title="Overwrite current data?"
        typeToConfirm="IMPORT"
      />
    );
    expect(
      screen.getByRole("button", { name: COPY_IMPORT })
    ).toBeInTheDocument();
    expect(screen.getByText("IMPORT")).toBeInTheDocument();
  });

  it("copies IMPORT to clipboard when Copy is clicked", async () => {
    const user = userEvent.setup();
    const writeMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeMock },
    });

    render(
      <ConfirmModal
        destructive
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open
        title="T"
        typeToConfirm="IMPORT"
      />
    );
    await user.click(screen.getByRole("button", { name: COPY_IMPORT }));
    expect(writeMock).toHaveBeenCalledWith("IMPORT");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("destructive confirm button is disabled and pale (opacity-50) until typed text matches", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        confirmLabel="Import and overwrite"
        destructive
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
        open
        title="Overwrite current data?"
        typeToConfirm="IMPORT"
      />
    );
    const confirmBtn = screen.getByRole("button", {
      name: IMPORT_AND_OVERWRITE,
    });
    // initially disabled + pale (explicit opacity-50 token)
    expect(confirmBtn).toBeDisabled();
    expect(confirmBtn.classList.contains("opacity-50")).toBe(true);

    // clicking disabled should not call onConfirm
    await user.click(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();

    // typing correct text enables full-color clickable button
    const input = screen.getByRole("textbox");
    await user.type(input, "IMPORT");
    expect(confirmBtn).not.toBeDisabled();
    expect(confirmBtn.classList.contains("opacity-50")).toBe(false);
    await user.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("stays disabled if text is wrong case", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmModal
        destructive
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open
        title="T"
        typeToConfirm="IMPORT"
      />
    );
    const input = screen.getByRole("textbox");
    const btn = screen.getByRole("button", { name: CONFIRM });
    await user.type(input, "import");
    expect(btn).toBeDisabled();
  });

  it("allows pasting IMPORT via clipboard to enable confirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        confirmLabel="Import and overwrite"
        destructive
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
        open
        title="T"
        typeToConfirm="IMPORT"
      />
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    const btn = screen.getByRole("button", { name: IMPORT_AND_OVERWRITE });
    expect(btn).toBeDisabled();

    // Simulate user pasting (Ctrl+V) — userEvent.paste uses clipboardData
    await user.click(input);
    await user.paste("IMPORT");

    expect(input.value).toBe("IMPORT");
    expect(btn).not.toBeDisabled();
    expect(btn.classList.contains("opacity-50")).toBe(false);
    await user.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
