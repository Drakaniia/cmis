import { screen } from "@testing-library/react";
import type { userEvent } from "@testing-library/user-event";

/**
 * Test-only helper for driving a `VocabularyPicker` (and `CategoryPicker`).
 *
 * Both used to be native `<select>` elements, so tests reached them with
 * `user.selectOptions`. They are popovers now — a `<select>` cannot host the
 * create/rename panel, which is the whole point — so a test has to open the
 * trigger and click the row.
 *
 * The row's accessible name is the term itself, with the usage count appended
 * when it is non-zero, and the rename/delete buttons beside it are named
 * `Rename <term>` / `Delete <term>`. Anchoring the row matcher to the start of
 * the term is what keeps it from also matching those two.
 */

/** Escapes a term for use inside a `RegExp` — `mg/5ml` and `mg/5ml` are not interchangeable. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The row that empties the field. The panel grows it only while a value is set. */
const NOT_RECORDED = /not recorded/i;

/**
 * Opens the picker whose trigger carries `label` and picks `termName`.
 *
 * `label` is matched against the trigger's accessible name, which for the `field`
 * variant is the column caption the picker renders above itself.
 *
 * The row's accessible name is the term, with the usage count appended when it is
 * non-zero — so the pattern allows a trailing number, and is anchored at both
 * ends. Anchoring matters twice over: the seeded strength list holds `mg`, `mg/ml`
 * and `mg/5ml`, so a prefix-only pattern would match all three, and the `Rename`
 * and `Delete` buttons beside each row would match too.
 */
export async function pickTerm(
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp | string,
  termName: string
): Promise<void> {
  await user.click(screen.getByRole("button", { name: label }));
  await user.click(
    screen.getByRole("button", {
      name: new RegExp(`^${escapeForRegExp(termName)}(\\s+\\d+)?$`),
    })
  );
}

/**
 * Empties a picker that currently holds a value.
 *
 * The panel grows a "not recorded" row only while something is set, mirroring
 * the blank `<option>` a native `<select>` used to carry.
 */
export async function clearTerm(
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp | string
): Promise<void> {
  await user.click(screen.getByRole("button", { name: label }));
  await user.click(screen.getByRole("button", { name: NOT_RECORDED }));
}

/** The value a picker's trigger currently shows, or `""` when it is collapsed. */
export function readTerm(label: RegExp | string): string {
  return screen.getByRole("button", { name: label }).textContent ?? "";
}
