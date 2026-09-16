// biome-ignore-all lint/performance/useTopLevelRegex: test regex convenience
import { AppleDatePicker } from "@cmis/ui/components/apple-date-picker";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

const TRIGGER = /choose date/i;
const NEXT_MONTH = /next month/i;

/**
 * Base UI's floating positioner cannot be used from jsdom tests: each open
 * costs tens of seconds re-measuring an anchor in an engine with no layout.
 * The shim keeps real open/close wiring while the calendar walks the fast path.
 */
vi.mock("@cmis/ui/components/popover", () => import("@/test/popover-shim"));

/**
 * Calendar clicks use `fireEvent` for brevity; free-text entry still goes
 * through user-event so keystroke-by-keystroke behaviour stays realistic.
 */
const { click } = fireEvent;
/**
 * These components live in `@cmis/ui` (the shared design system), which has no
 * test runner of its own — the desktop app's vitest setup covers them.
 */
function Harness({
  initial = "",
  max,
  min,
}: {
  initial?: string;
  max?: string;
  min?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label>
        Expiry date
        <AppleDatePicker
          max={max}
          min={min}
          onChange={setValue}
          value={value}
        />
      </label>
      <span data-testid="committed">{value}</span>
    </>
  );
}

function getField() {
  return screen.getByLabelText(/Expiry date/i);
}

function getCommitted() {
  return screen.getByTestId("committed");
}

describe("AppleDatePicker", () => {
  it("commits a typed ISO date", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(getField(), "2026-12-01");
    expect(getCommitted()).toHaveTextContent("2026-12-01");
  });

  it("formats compact digits into an ISO date", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(getField(), "20261201");
    expect(getField()).toHaveValue("2026-12-01");
    expect(getCommitted()).toHaveTextContent("2026-12-01");
  });

  it("reverts unparseable text when the field loses focus", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-05" />);

    await user.type(getField(), "nope");
    await user.tab();

    expect(getField()).toHaveValue("2026-11-05");
    expect(getCommitted()).toHaveTextContent("2026-11-05");
  });

  it("clears the committed value when the field is emptied", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-11-05" />);

    await user.clear(getField());

    expect(getCommitted()).toHaveTextContent("");
  });

  // One mount on purpose: every open popover leaves an animation-frame loop
  // behind in jsdom, so popover coverage stays in a single test.
  it("picks a day, honours min/max and walks months", () => {
    render(<Harness initial="2026-09-15" max="2026-09-20" min="2026-09-10" />);

    click(screen.getByRole("button", { name: TRIGGER }));
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2026-09-05" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "2026-09-12" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "2026-09-28" })).toBeDisabled();

    click(screen.getByRole("button", { name: NEXT_MONTH }));
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    click(screen.getByRole("button", { name: /previous month/i }));

    click(screen.getByRole("button", { name: "2026-09-20" }));
    expect(getCommitted()).toHaveTextContent("2026-09-20");
    expect(getField()).toHaveValue("2026-09-20");

    click(screen.getByRole("button", { name: TRIGGER }));
    click(screen.getByRole("button", { name: /^clear$/i }));
    expect(getCommitted()).toHaveTextContent("");
    expect(getField()).toHaveValue("");
  });
});
