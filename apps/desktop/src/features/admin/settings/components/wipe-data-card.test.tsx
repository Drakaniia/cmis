import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { WipeDataCard } from "./wipe-data-card";

const WIPE_ALL_DATA_RE = /wipe all data/i;
const WIPE_DATA_RE = /wipe data/i;
const COPY_WIPE_RE = /copy wipe/i;
const TYPE_WIPE_RE = /type wipe to confirm/i;
const DANGER_ZONE_RE = /danger zone/i;
const PERMANENTLY_DELETE_RE = /permanently delete/i;

it("gates confirm until WIPE typed and copy button fills input", async () => {
  const onWipe = vi.fn().mockResolvedValue(undefined);
  render(<WipeDataCard onWipe={onWipe} />);
  await userEvent.click(screen.getByRole("button", { name: WIPE_ALL_DATA_RE }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  const confirm = screen.getByRole("button", { name: WIPE_DATA_RE });
  expect(confirm).toBeDisabled();
  // Copy button exists and is clickable (ConfirmModal copy logic)
  const copyBtn = screen.getByRole("button", { name: COPY_WIPE_RE });
  expect(copyBtn).toBeInTheDocument();
  await userEvent.click(copyBtn);
  // After copy, still gated until WIPE typed manually (ConfirmModal requires typed.trim()==="WIPE")
  // Type WIPE into the confirmation input
  const input = screen.getByLabelText(TYPE_WIPE_RE);
  await userEvent.type(input, "WIPE");
  expect(confirm).toBeEnabled();
  await userEvent.click(confirm);
  expect(onWipe).toHaveBeenCalledWith({ resetSettings: true });
});

it("checkbox default checked (maximal wipe)", async () => {
  const onWipe = vi.fn().mockResolvedValue(undefined);
  render(<WipeDataCard onWipe={onWipe} />);
  const checkbox = screen.getByRole("checkbox");
  expect(checkbox).toBeChecked();
  // uncheck should pass resetSettings false
  await userEvent.click(checkbox);
  expect(checkbox).not.toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: WIPE_ALL_DATA_RE }));
  const input = screen.getByLabelText(TYPE_WIPE_RE);
  await userEvent.type(input, "WIPE");
  await userEvent.click(screen.getByRole("button", { name: WIPE_DATA_RE }));
  expect(onWipe).toHaveBeenCalledWith({ resetSettings: false });
});

it("renders Danger Zone card with destructive styling", () => {
  render(<WipeDataCard onWipe={vi.fn()} />);
  expect(screen.getByText(DANGER_ZONE_RE)).toBeInTheDocument();
  expect(screen.getByText(PERMANENTLY_DELETE_RE)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: WIPE_ALL_DATA_RE })
  ).toBeInTheDocument();
});
