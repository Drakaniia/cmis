// biome-ignore-all lint/performance/useTopLevelRegex: test regex convenience
import { QuantityStepper } from "@cmis/ui/components/quantity-stepper";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

const INCREASE = /increase quantity/i;
const DECREASE = /decrease quantity/i;

const noop = () => undefined;

/**
 * These components live in `@cmis/ui` (the shared design system), which has no
 * test runner of its own — the desktop app's vitest setup covers them.
 */
function Harness({
  initial = 0,
  max,
  min,
}: {
  initial?: number | "";
  max?: number;
  min?: number;
}) {
  const [value, setValue] = useState<number | "">(initial);
  return (
    <QuantityStepper
      aria-label="Quantity"
      max={max}
      min={min}
      onChange={setValue}
      value={value}
    />
  );
}

function getInput() {
  return screen.getByRole("spinbutton", { name: "Quantity" });
}

describe("QuantityStepper", () => {
  it("steps up and down through the custom arrows", async () => {
    const user = userEvent.setup();
    render(<Harness initial={5} />);

    await user.click(screen.getByRole("button", { name: INCREASE }));
    expect(getInput()).toHaveValue("6");

    await user.click(screen.getByRole("button", { name: DECREASE }));
    await user.click(screen.getByRole("button", { name: DECREASE }));
    expect(getInput()).toHaveValue("4");
  });

  it("starts from min when empty", async () => {
    const user = userEvent.setup();
    render(<Harness initial="" min={1} />);

    await user.click(screen.getByRole("button", { name: INCREASE }));
    expect(getInput()).toHaveValue("1");
  });

  it("disables the arrow that would leave the range", async () => {
    const user = userEvent.setup();
    render(<Harness initial={1} max={2} min={1} />);

    expect(screen.getByRole("button", { name: DECREASE })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: INCREASE }));
    expect(getInput()).toHaveValue("2");
    expect(screen.getByRole("button", { name: INCREASE })).toBeDisabled();
    expect(screen.getByRole("button", { name: DECREASE })).toBeEnabled();
  });

  it("steps from the keyboard and jumps to the bounds", async () => {
    const user = userEvent.setup();
    render(<Harness initial={5} max={50} min={2} />);
    const input = getInput();

    input.focus();
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("6");

    await user.keyboard("{PageUp}");
    expect(input).toHaveValue("16");

    await user.keyboard("{PageDown}");
    expect(input).toHaveValue("6");

    await user.keyboard("{Home}");
    expect(input).toHaveValue("2");

    await user.keyboard("{End}");
    expect(input).toHaveValue("50");
  });

  it("ignores letters and clamps to min on blur", async () => {
    const user = userEvent.setup();
    render(<Harness initial={3} min={1} />);
    const input = getInput();

    await user.clear(input);
    await user.type(input, "e-");
    expect(input).toHaveValue("");

    await user.type(input, "0");
    expect(input).toHaveValue("0");
    await user.tab();
    expect(input).toHaveValue("1");
  });

  it("marks itself invalid without owning the message", () => {
    render(
      <QuantityStepper aria-label="Quantity" invalid onChange={noop} value="" />
    );
    expect(getInput()).toHaveAttribute("aria-invalid", "true");
  });
});
