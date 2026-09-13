/**
 * CMIS-UI-09 §3.3 — URL-persisted audit filters.
 *
 * Active filters live in the URL so an audit sweep is bookmarkable and the
 * command palette can deep-link straight to a filtered log (§6).
 */

import type { AuditActionType, AuditDatePreset, AuditFilters } from "./types";
import {
  AUDIT_ACTION_TYPES,
  AUDIT_DATE_PRESETS,
  isAuditActionType,
} from "./types";

export interface AuditSearch {
  /** Comma-separated action types */
  actions?: string;
  preset?: AuditDatePreset;
  /** Free-text search */
  q?: string;
  user?: string;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function isPreset(value: string): value is AuditDatePreset {
  return AUDIT_DATE_PRESETS.some((preset) => preset.value === value);
}

export function validateAuditSearch(
  search: Record<string, unknown>
): AuditSearch {
  const actions = readString(search.actions);
  const preset = readString(search.preset);
  const q = readString(search.q);
  const user = readString(search.user);

  return {
    ...(actions ? { actions } : {}),
    ...(preset && isPreset(preset) ? { preset } : {}),
    ...(q ? { q } : {}),
    ...(user ? { user } : {}),
  };
}

export function actionsFromParam(param?: string): AuditActionType[] {
  if (!param) {
    return [];
  }
  return param
    .split(",")
    .map((value) => value.trim())
    .filter(isAuditActionType);
}

export function filtersFromSearch(search: AuditSearch): Partial<AuditFilters> {
  const actions = actionsFromParam(search.actions);
  return {
    ...(actions.length ? { actions } : {}),
    ...(search.preset ? { preset: search.preset } : {}),
    ...(search.q ? { search: search.q } : {}),
    ...(search.user ? { user: search.user } : {}),
  };
}

export function searchFromFilters(filters: AuditFilters): AuditSearch {
  const actions = filters.actions.filter(isAuditActionType);
  return {
    ...(actions.length ? { actions: actions.join(",") } : {}),
    ...(filters.preset === "30d" ? {} : { preset: filters.preset }),
    ...(filters.search.trim() ? { q: filters.search } : {}),
    ...(filters.user === "All" ? {} : { user: filters.user }),
  };
}

export function auditSearchEquals(a: AuditSearch, b: AuditSearch): boolean {
  return (
    (a.actions ?? "") === (b.actions ?? "") &&
    (a.preset ?? "30d") === (b.preset ?? "30d") &&
    (a.q ?? "") === (b.q ?? "") &&
    (a.user ?? "") === (b.user ?? "")
  );
}

export const ALL_ACTION_TYPES = AUDIT_ACTION_TYPES;
