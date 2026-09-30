/**
 * CMIS-UI-05 §5 — URL-persisted filter state.
 *
 * Both `/admin/requests` validates its search params through here so a filter
 * URL is bookmarkable and shareable.
 */

import { keysEqual } from "@/features/shared/keys-equal";
import { readString } from "@/features/shared/read-string";
import type { RequestDatePreset, RequestFilters } from "./types";
import { REQUEST_DATE_PRESETS } from "./types";

export interface RequestsSearch {
  category?: string;
  /** Custom range start, ISO date */
  from?: string;
  preset?: RequestDatePreset;
  /** Search text — kept short in the URL */
  q?: string;
  requestor?: string;
  /** Custom range end, ISO date */
  to?: string;
}

export function isRequestDatePreset(value: string): value is RequestDatePreset {
  return REQUEST_DATE_PRESETS.some((preset) => preset.value === value);
}

export function validateRequestsSearch(
  search: Record<string, unknown>
): RequestsSearch {
  const category = readString(search.category);
  const from = readString(search.from);
  const preset = readString(search.preset);
  const q = readString(search.q);
  const requestor = readString(search.requestor);
  const to = readString(search.to);

  return {
    ...(category ? { category } : {}),
    ...(from ? { from } : {}),
    ...(preset && isRequestDatePreset(preset) ? { preset } : {}),
    ...(q ? { q } : {}),
    ...(requestor ? { requestor } : {}),
    ...(to ? { to } : {}),
  };
}

/** Seed the filter state from a deep link, without overwriting defaults. */
export function filtersFromSearch(
  search: RequestsSearch
): Partial<RequestFilters> {
  return {
    ...(search.category ? { category: search.category } : {}),
    ...(search.from ? { from: search.from } : {}),
    ...(search.preset ? { datePreset: search.preset } : {}),
    ...(search.requestor ? { requestor: search.requestor } : {}),
    ...(search.q ? { search: search.q } : {}),
    ...(search.to ? { to: search.to } : {}),
  };
}

export function searchFromFilters(filters: RequestFilters): RequestsSearch {
  const isCustom = filters.datePreset === "custom";
  return {
    ...(filters.category === "All" ? {} : { category: filters.category }),
    ...(isCustom && filters.from ? { from: filters.from } : {}),
    ...(filters.datePreset === "all" ? {} : { preset: filters.datePreset }),
    ...(filters.requestor.trim() ? { requestor: filters.requestor } : {}),
    ...(filters.search.trim() ? { q: filters.search } : {}),
    ...(isCustom && filters.to ? { to: filters.to } : {}),
  };
}

export function requestsSearchEquals(
  a: RequestsSearch,
  b: RequestsSearch
): boolean {
  return keysEqual(a, b, {
    category: "",
    from: "",
    preset: "all",
    q: "",
    requestor: "",
    to: "",
  });
}
