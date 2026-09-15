/**
 * Builds the pre-filled GitHub bug-report URL for the in-app dialog.
 *
 * Pure and synchronous so it can be unit-tested. Option strings and field ids
 * mirror `.github/ISSUE_TEMPLATE/bug_report.yml` exactly — GitHub only
 * pre-selects dropdown entries when the value matches the option text, and only
 * fills form fields when the query key matches the field `id`.
 */

export const REPO_URL = "https://github.com/Drakaniia/cmis";

export const ISSUE_TEMPLATE = "bug_report.yml";

/** GitHub URLs are practical up to ~8 KB; ~2 000 chars per field keeps us clear. */
export const MAX_FIELD_LENGTH = 2000;

export const ALLOWED_ISSUE_HOST = "github.com";

export const AREA_OPTIONS = [
  "Shell / Nav / Auth (CMIS-UI-00)",
  "Home dashboards (CMIS-UI-01)",
  "Inventory management (CMIS-UI-02)",
  "Expiry alerts (CMIS-UI-03)",
  "Low-stock alerts (CMIS-UI-04)",
  "Request queue / Kanban (CMIS-UI-05)",
  "Dispensing log (CMIS-UI-06)",
  "Reports & analytics (CMIS-UI-07)",
  "Viewer portal (CMIS-UI-08)",
  "Admin (CMIS-UI-09)",
  "Offline / Sync (CMIS-03 §4)",
  "Packages (ui / env / config)",
  "Tauri / Desktop build",
  "CI / Tooling",
] as const;

export type AreaOption = (typeof AREA_OPTIONS)[number];

export const SEVERITY_OPTIONS = [
  "critical — blocks dispensing / stock-out / data loss",
  "high — major flow broken, workaround exists",
  "medium — minor flow broken",
  "low — cosmetic / polish",
] as const;

export type SeverityOption = (typeof SEVERITY_OPTIONS)[number];

export const DEFAULT_SEVERITY: SeverityOption = SEVERITY_OPTIONS[2];

export interface IssueDraft {
  actual: string;
  appVersion: string;
  /** Ordered selection; each entry becomes a repeated `area` param. */
  areas: readonly string[];
  expected: string;
  platform: string;
  repro: string;
  severity: string;
  summary: string;
}

export interface IssueDraftErrors {
  actual?: string;
  areas?: string;
  expected?: string;
  repro?: string;
  summary?: string;
}

/** Trim + hard-cap a field so an over-eager paste cannot blow the URL limit. */
export function clampField(
  value: string,
  max: number = MAX_FIELD_LENGTH
): string {
  return value.trim().slice(0, max);
}

/**
 * Required-field validation. Severity/platform/app version always carry a value
 * (default or auto-detected), so only user-authored fields can be missing.
 */
export function validateIssueDraft(draft: IssueDraft): IssueDraftErrors {
  const errors: IssueDraftErrors = {};
  if (draft.areas.length === 0) {
    errors.areas = "Choose at least one area.";
  }
  if (clampField(draft.summary).length === 0) {
    errors.summary = "Add a one-line summary.";
  }
  if (clampField(draft.repro).length === 0) {
    errors.repro = "List the steps that reproduce the problem.";
  }
  if (clampField(draft.expected).length === 0) {
    errors.expected = "Describe what should have happened.";
  }
  if (clampField(draft.actual).length === 0) {
    errors.actual = "Describe what happened instead.";
  }
  return errors;
}

export function hasErrors(errors: IssueDraftErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * `https://github.com/<owner>/<repo>/issues/new?template=bug_report.yml&title=…
 * &area=…&severity=…&summary=…&repro=…&expected=…&actual=…&app_version=…&platform=…`
 *
 * Multi-select `area` repeats the parameter, matching the template's
 * `multiple: true` dropdown. Empty values are omitted so GitHub's own
 * validations (rather than an empty pre-fill) take over.
 */
export function buildIssueUrl(draft: IssueDraft): string {
  const params = new URLSearchParams();
  params.set("template", ISSUE_TEMPLATE);
  params.set("title", `[Bug] ${clampField(draft.summary)}`);

  for (const area of draft.areas) {
    const value = clampField(area);
    if (value.length > 0) {
      params.append("area", value);
    }
  }

  const fields: [string, string][] = [
    ["severity", draft.severity],
    ["summary", clampField(draft.summary)],
    ["repro", clampField(draft.repro)],
    ["expected", clampField(draft.expected)],
    ["actual", clampField(draft.actual)],
    ["app_version", clampField(draft.appVersion, 120)],
    ["platform", clampField(draft.platform)],
  ];

  for (const [key, value] of fields) {
    if (value.length > 0) {
      params.set(key, value);
    }
  }

  return `${REPO_URL}/issues/new?${params.toString()}`;
}
