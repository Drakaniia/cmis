/**
 * Stock item search for the ⌘K command palette (spec F3, D5/D6/D10/D11/D27).
 *
 * One pure, tested matcher replaces what would otherwise be a sixth hand-rolled
 * `includes()` loop — the palette renders the returned `matches` in order, so
 * ranking and highlighting live here rather than in the component.
 *
 * The shape is deliberately inventory-specific (`InventoryItem`, not a generic),
 * because the fields it matches on are the medicine's own identity. Adoption by
 * the other pickers is a recorded follow-up (spec §11), not this change.
 *
 * Purity matters: no React, no fetching, no clock, no locale-dependent ordering
 * beyond `localeCompare` for the tie-break. Hand-built fixtures test it without
 * a database.
 */

import type { InventoryItem } from "../types";
import { composeListLabel } from "./strength";

export interface StockItemSearchOptions {
  /** Row cap. Default 8 (D7). */
  limit?: number;
}

/** A `[start, end)` range into one of the rendered strings. */
export type HighlightRange = [number, number];

export interface StockItemHighlight {
  /** Ranges into `composeListLabel(item)`. */
  label: HighlightRange[];
  /** Ranges into `item.sku`. */
  sku: HighlightRange[];
}

export interface StockItemMatch {
  highlight: StockItemHighlight;
  item: InventoryItem;
  /** Match tier, ascending quality: 0 exact, 1 prefix, 2 substring, 3 fuzzy. */
  tier: number;
}

export interface StockItemSearchResult {
  matches: StockItemMatch[];
  /** Matches found before the cap, so the caller can render "…and N more". */
  total: number;
}

/** D7 — the palette shows eight rows and then tells the operator how many more. */
export const DEFAULT_ITEM_SEARCH_LIMIT = 8;

/** Collapse runs of whitespace so `" para   500 "` matches `Paracetamol 500 mg`. */
const WHITESPACE = /\s+/g;

/** Trim, lower-case and collapse internal whitespace — the one normalization. */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(WHITESPACE, " ");
}

/** D5 — the four matchable fields, normalized and without blank values. */
function haystackFields(item: InventoryItem): string[] {
  const fields = [item.name, item.displayName, item.sku, item.barcode ?? ""];
  return fields.map(normalize).filter((field) => field !== "");
}

interface Classification {
  score: number;
  tier: number;
}

/**
 * Tiers 0–2 (D10). Exact is a whole-field hit on the SKU, barcode or name;
 * prefix is a whole-field start; substring is every query token present in one
 * field, which is what lets `"para 500"` find `Paracetamol 500 mg`.
 */
function classify(
  item: InventoryItem,
  query: string,
  tokens: string[]
): Classification | null {
  const fields = haystackFields(item);
  if (fields.some((field) => field === query)) {
    return { score: 0, tier: 0 };
  }
  if (fields.some((field) => field.startsWith(query))) {
    return { score: 0, tier: 1 };
  }
  if (fields.some((field) => tokens.every((token) => field.includes(token)))) {
    return { score: 0, tier: 2 };
  }
  return null;
}

/**
 * Subsequence-with-adjacency score: `paracetmol` still reaches `Paracetamol`.
 *
 * Zero means "not a subsequence of this field". Runs of adjacent characters earn
 * extra weight so a near-exact typo outranks a scattered one, and every field is
 * scored so the best field wins.
 */
function fuzzyTokenScore(token: string, field: string): number {
  let tokenIndex = 0;
  let previousIndex = -2;
  let streak = 0;
  let score = 0;

  for (
    let index = 0;
    index < field.length && tokenIndex < token.length;
    index += 1
  ) {
    if (field[index] !== token[tokenIndex]) {
      continue;
    }
    streak = index === previousIndex + 1 ? streak + 1 : 1;
    score += 1 + streak * 0.5;
    previousIndex = index;
    tokenIndex += 1;
  }

  return tokenIndex === token.length ? score : 0;
}

/** Every token must be a subsequence of the *same* field for the field to count. */
function fuzzyScore(tokens: string[], fields: string[]): number {
  let best = 0;
  for (const field of fields) {
    let total = 0;
    let matchedAll = true;
    for (const token of tokens) {
      const score = fuzzyTokenScore(token, field);
      if (score === 0) {
        matchedAll = false;
        break;
      }
      total += score;
    }
    if (matchedAll && total > best) {
      best = total;
    }
  }
  return best;
}

/** Merge overlapping/adjacent ranges so the renderer can split in one pass. */
function mergeRanges(ranges: HighlightRange[]): HighlightRange[] {
  if (ranges.length <= 1) {
    return ranges;
  }
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: HighlightRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([range[0], range[1]]);
    }
  }
  return merged;
}

/**
 * Every occurrence of each query token in the rendered string. A fuzzy match has
 * no contiguous span, so its tokens resolve to no ranges and the row renders
 * plain — which is the correct, honest result (D11).
 */
function findRanges(text: string, tokens: string[]): HighlightRange[] {
  if (text === "") {
    return [];
  }
  const lower = text.toLowerCase();
  const ranges: HighlightRange[] = [];
  for (const token of tokens) {
    if (token === "") {
      continue;
    }
    let from = 0;
    while (from <= lower.length - token.length) {
      const index = lower.indexOf(token, from);
      if (index === -1) {
        break;
      }
      ranges.push([index, index + token.length]);
      from = index + token.length;
    }
  }
  return mergeRanges(ranges);
}

function buildHighlight(
  item: InventoryItem,
  tokens: string[]
): StockItemHighlight {
  return {
    label: findRanges(composeListLabel(item), tokens),
    sku: findRanges(item.sku, tokens),
  };
}

/**
 * D10 tie-break: the same stable order the inventory query returns rows in
 * (`ORDER BY name, strength_value, form`), so equal-quality matches never shuffle
 * between keystrokes.
 */
function compareItems(a: InventoryItem, b: InventoryItem): number {
  return (
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
    a.strengthValue
      .toLowerCase()
      .localeCompare(b.strengthValue.toLowerCase()) ||
    a.form.toLowerCase().localeCompare(b.form.toLowerCase())
  );
}

interface ScoredItem {
  item: InventoryItem;
  score: number;
  tier: number;
}

/**
 * Match, rank and highlight stock items for a palette query.
 *
 * Returns the final order — callers render `matches` as given and never re-sort.
 * Fuzzy matching is a fallback only (D6/D24): it runs when tiers 0–2 found
 * nothing at all, so it can never add noise beside a real substring hit.
 */
export function searchStockItems(
  items: readonly InventoryItem[],
  rawQuery: string,
  options?: StockItemSearchOptions
): StockItemSearchResult {
  const query = normalize(rawQuery);
  if (query === "") {
    return { matches: [], total: 0 };
  }

  const tokens = query.split(" ");
  const scored: ScoredItem[] = [];
  for (const item of items) {
    const classification = classify(item, query, tokens);
    if (classification) {
      scored.push({ item, ...classification });
    }
  }

  if (scored.length === 0) {
    for (const item of items) {
      const score = fuzzyScore(tokens, haystackFields(item));
      if (score > 0) {
        scored.push({ item, score, tier: 3 });
      }
    }
  }

  scored.sort(
    (a, b) =>
      a.tier - b.tier || b.score - a.score || compareItems(a.item, b.item)
  );

  const limit = Math.max(0, options?.limit ?? DEFAULT_ITEM_SEARCH_LIMIT);
  return {
    matches: scored.slice(0, limit).map((entry) => ({
      highlight: buildHighlight(entry.item, tokens),
      item: entry.item,
      tier: entry.tier,
    })),
    total: scored.length,
  };
}
