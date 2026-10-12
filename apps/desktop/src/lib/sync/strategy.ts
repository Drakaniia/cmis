/**
 * CMIS Cloud Sync — the data-guard decisions, as pure functions.
 *
 * `docs/cloud-sync-data-guard-spec.md` §6.1 is a four-row table: what to do
 * when this device and the cloud each hold (or do not hold) records, and §6.4
 * is the chooser that resolves the one ambiguous row. Both must not be guessed
 * differently in two places, so the table lives here as data-free functions and
 * the provider only executes the answer.
 *
 * Nothing here touches a database or the network, which is what makes every
 * branch cheap to test (`strategy.test.ts`) instead of hoped for.
 */

export type SyncStrategy = "local" | "cloud" | "merge";

/** The three remembered choices, in the order the chooser presents them. */
export const SYNC_STRATEGIES: readonly SyncStrategy[] = [
  "local",
  "cloud",
  "merge",
];

export function isSyncStrategy(value: unknown): value is SyncStrategy {
  return value === "local" || value === "cloud" || value === "merge";
}

/**
 * Which row of the decision table a run is in (§6.1).
 *
 * - `idle` — nothing on either side; do nothing.
 * - `pull-only` — empty device, populated cloud; full pull, silently.
 * - `push-only` — populated device, empty cloud; push this device's records.
 * - `overlap` — both sides hold records; a remembered strategy or the chooser.
 */
export type SyncSituation = "idle" | "overlap" | "pull-only" | "push-only";

export function classifySyncSituation(input: {
  cloudHasData: boolean;
  localHasData: boolean;
}): SyncSituation {
  const { localHasData, cloudHasData } = input;
  if (!(localHasData || cloudHasData)) {
    return "idle";
  }
  if (localHasData && cloudHasData) {
    return "overlap";
  }
  return cloudHasData ? "pull-only" : "push-only";
}

/** A remembered strategy for one endpoint, or `null` when there is none. */
export function strategyForEndpoint(
  strategies: Record<string, SyncStrategy> | undefined,
  endpoint: string
): SyncStrategy | null {
  if (!(strategies && endpoint)) {
    return null;
  }
  const value = strategies[endpoint];
  return isSyncStrategy(value) ? value : null;
}

/** A copy of the strategy map with one endpoint's decision recorded. */
export function rememberStrategy(
  strategies: Record<string, SyncStrategy> | undefined,
  endpoint: string,
  strategy: SyncStrategy
): Record<string, SyncStrategy> {
  if (endpoint === "") {
    return { ...strategies };
  }
  return { ...strategies, [endpoint]: strategy };
}

/**
 * Plain-language reason for §6.7: a run that applied nothing while the cloud
 * holds more than this device must never read as a silent zero.
 *
 * Returns `null` when there is nothing to explain — the ordinary case of a run
 * that either downloaded something or had nothing to download.
 */
export function explainNoDownload(input: {
  applied: number;
  cloudTotal: number;
  localTotal: number;
  ranPull: boolean;
  skipped: number;
}): string | null {
  const { applied, cloudTotal, localTotal, ranPull, skipped } = input;
  if (applied > 0) {
    return null;
  }
  if (!ranPull) {
    return "No pull was performed this run.";
  }
  if (cloudTotal <= localTotal) {
    // The device already holds everything the cloud does; an empty apply is
    // the correct, unremarkable outcome.
    return null;
  }
  if (skipped > 0) {
    return `${skipped} cloud row${skipped === 1 ? "" : "s"} skipped (missing parent record or a newer local delete).`;
  }
  return "This device's pull cursor is at or past the cloud's newest data, so nothing new arrived.";
}
