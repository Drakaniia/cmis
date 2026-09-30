import { SEED_VOCABULARY, type VocabularyKind } from "./vocabulary";

/**
 * The live vocabulary, as the synchronous domain code sees it.
 *
 * `validatePackFields`, `splitDosage`, `baseUnitFor`, `parsePackSize` and the
 * CSV importer all need the current list, and all of them are **synchronous** —
 * they run inside a form's render, inside a draft validation, and inside a parse
 * loop. Threading a list through every one of those call sites would make them
 * async or push a parameter through twenty files, so instead the list is
 * hydrated once at startup and read from a module.
 *
 * The safety property that makes this acceptable: the snapshot **starts** as
 * `SEED_VOCABULARY` and is only ever replaced wholesale. A read that happens
 * before `hydrateVocabulary` — a unit test, a module that loads before the
 * database, the browser preview with no SQL plugin — sees the shipped tokens
 * rather than an empty list. That is why every pure-domain test in this feature
 * (`strength.test.ts`, `pack-size.test.ts`, `item-update.test.ts`) keeps
 * passing without a database.
 */

/** Bumped by every `setVocabulary`, so downstream memos know to rebuild. */
let version = 0;

let snapshot: Record<VocabularyKind, readonly string[]> = {
  form: SEED_VOCABULARY.form,
  pack_unit: SEED_VOCABULARY.pack_unit,
  strength_unit: SEED_VOCABULARY.strength_unit,
};

/** The current names for one kind, in the order the dropdowns render them. */
export function vocabulary(kind: VocabularyKind): readonly string[] {
  return snapshot[kind];
}

/** Every kind at once — what the startup hydration reads in one query. */
export function vocabularySnapshot(): Record<
  VocabularyKind,
  readonly string[]
> {
  return snapshot;
}

/**
 * Replaces one kind's list. Called by the startup hydration and by every
 * create/rename/delete mutation, so the synchronous domain sees the change
 * without a refetch.
 */
export function setVocabulary(
  kind: VocabularyKind,
  terms: readonly string[]
): void {
  snapshot = { ...snapshot, [kind]: terms };
  version += 1;
}

/**
 * The value derived structures memoise against. A memo built at version `n` is
 * reusable while this still reads `n`.
 */
export function vocabularyVersion(): number {
  return version;
}

interface DerivedMemo {
  value: unknown;
  version: number;
}

const derived = new Map<string, DerivedMemo>();

/**
 * A structure built from one kind's list, rebuilt only when that list changes.
 *
 * Three places need a derived shape rather than the array itself: the
 * length-sorted unit list `splitDosage` matches against, and the two token sets
 * `baseUnitFor` and `parsePackSize` test membership with. All three are per-row
 * hot in an import and all three are pure functions of a list, so they are worth
 * memoising — but a memo that does not know the list moved would quietly serve a
 * vocabulary from before the operator's last edit, which is the one bug this
 * module exists to make impossible.
 *
 * `key` is caller-chosen and must be unique per derivation, **not** merely per
 * kind: `baseUnitFor` and `parsePackSize` each want a normalised form set today
 * and happen to build the same one, but keying both on `"form"` would let a later
 * edit to one of them silently change the other. The kind prefix is convention,
 * not enforcement.
 */
export function derivedVocabulary<T>(key: string, build: () => T): T {
  const current = vocabularyVersion();
  const memo = derived.get(key);
  if (memo !== undefined && memo.version === current) {
    return memo.value as T;
  }
  const value = build();
  derived.set(key, { value, version: current });
  return value;
}

/** Test seam — puts the shipped seeds back. */
export function resetVocabularyForTesting(): void {
  snapshot = {
    form: SEED_VOCABULARY.form,
    pack_unit: SEED_VOCABULARY.pack_unit,
    strength_unit: SEED_VOCABULARY.strength_unit,
  };
  version = 0;
  derived.clear();
}

/**
 * Case-insensitive membership, matching the `COLLATE NOCASE` the table and every
 * duplicate check use.
 *
 * `validatePackFields` lower-cases before it looks in a `Set`, which is the same
 * rule; this is the one place that rule now lives, so the validator, the parser
 * and the picker cannot disagree about whether "MG" is `mg`.
 */
export function hasVocabularyTerm(kind: VocabularyKind, name: string): boolean {
  const needle = name.trim().toLowerCase();
  if (needle === "") {
    return false;
  }
  return vocabulary(kind).some((term) => term.toLowerCase() === needle);
}
