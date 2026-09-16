/**
 * Who the audit log credits for a write (spec §8.3).
 *
 * There is no current-user concept in this app — it is a single-user desktop
 * build — so the actor is whatever the operator typed in Settings, falling back
 * to a neutral label. The value lives in a module-level store rather than React
 * state because the writers are plain modules (`use-stock-mutations.ts`,
 * `lib/db.ts`) that run outside any component tree.
 */

export const DEFAULT_OPERATOR = "Local user";

let operatorName = DEFAULT_OPERATOR;

/** The name to record, never blank. */
export function getOperatorName(): string {
  return operatorName;
}

/** Blank input resolves to the fallback so an audit row always names someone. */
export function setOperatorName(name: string | null | undefined): void {
  const trimmed = (name ?? "").trim();
  operatorName = trimmed === "" ? DEFAULT_OPERATOR : trimmed;
}

/** Test seam — restores the fallback between cases. */
export function resetOperatorForTesting(): void {
  operatorName = DEFAULT_OPERATOR;
}
