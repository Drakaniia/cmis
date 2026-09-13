/**
 * CMIS-UI-06 §3 — URL-persisted dispensing filters.
 *
 * Active filters live in the URL so an audit sweep is bookmarkable and the
 * command palette can deep-link straight to a filtered dispensing log.
 */

import type {
  DispensingDatePreset,
  DispensingFilters,
  DispensingStatus,
} from "./types";
import { DISPENSING_DATE_PRESETS } from "./types";

export interface DispensingSearch {
  branch?: string;
  medicine?: string;
  preset?: DispensingDatePreset;
  q?: string;
  requestor?: string;
  staff?: string;
  status?: string;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function isPreset(value: string): value is DispensingDatePreset {
  return DISPENSING_DATE_PRESETS.some((preset) => preset.value === value);
}

function isStatus(value: string): value is "all" | DispensingStatus {
  return value === "all" || value === "dispensed" || value === "denied";
}

export function validateDispensingSearch(
  search: Record<string, unknown>
): DispensingSearch {
  const branch = readString(search.branch);
  const medicine = readString(search.medicine);
  const preset = readString(search.preset);
  const q = readString(search.q);
  const requestor = readString(search.requestor);
  const staff = readString(search.staff);
  const status = readString(search.status);

  return {
    ...(branch ? { branch } : {}),
    ...(medicine ? { medicine } : {}),
    ...(preset && isPreset(preset) ? { preset } : {}),
    ...(q ? { q } : {}),
    ...(requestor ? { requestor } : {}),
    ...(staff ? { staff } : {}),
    ...(status && isStatus(status) ? { status } : {}),
  };
}

export function filtersFromSearch(
  search: DispensingSearch
): Partial<DispensingFilters> {
  return {
    ...(search.branch ? { branch: search.branch } : {}),
    ...(search.medicine ? { medicine: search.medicine } : {}),
    ...(search.preset ? { preset: search.preset } : {}),
    ...(search.q ? { search: search.q } : {}),
    ...(search.requestor ? { requestor: search.requestor } : {}),
    ...(search.staff ? { staff: search.staff } : {}),
    ...(search.status && isStatus(search.status)
      ? { status: search.status }
      : {}),
  };
}

export function searchFromFilters(
  filters: DispensingFilters
): DispensingSearch {
  return {
    ...(filters.branch === "All" ? {} : { branch: filters.branch }),
    ...(filters.medicine === "All" ? {} : { medicine: filters.medicine }),
    ...(filters.preset === "30d" ? {} : { preset: filters.preset }),
    ...(filters.requestor.trim() ? { requestor: filters.requestor } : {}),
    ...(filters.search.trim() ? { q: filters.search } : {}),
    ...(filters.staff === "All" ? {} : { staff: filters.staff }),
    ...(filters.status === "all" ? {} : { status: filters.status }),
  };
}

export function dispensingSearchEquals(
  a: DispensingSearch,
  b: DispensingSearch
): boolean {
  return (
    (a.branch ?? "") === (b.branch ?? "") &&
    (a.medicine ?? "") === (b.medicine ?? "") &&
    (a.preset ?? "30d") === (b.preset ?? "30d") &&
    (a.q ?? "") === (b.q ?? "") &&
    (a.requestor ?? "") === (b.requestor ?? "") &&
    (a.staff ?? "") === (b.staff ?? "") &&
    (a.status ?? "all") === (b.status ?? "all")
  );
}
