import { describe, expect, it } from "vitest";

import {
  AREA_OPTIONS,
  buildIssueUrl,
  clampField,
  DEFAULT_SEVERITY,
  hasErrors,
  type IssueDraft,
  MAX_FIELD_LENGTH,
  validateIssueDraft,
} from "./github-issue-url";

const draft: IssueDraft = {
  actual: "Nothing appeared.",
  appVersion: "0.1.0",
  areas: [AREA_OPTIONS[3], AREA_OPTIONS[4]],
  expected: "The batch is listed.",
  platform: "Desktop — Windows",
  repro: "1. Open Inventory\n2. Add a batch",
  severity: DEFAULT_SEVERITY,
  summary: "Expiry alert missing",
};

function paramsOf(url: string): URLSearchParams {
  return new URLSearchParams(url.slice(url.indexOf("?") + 1));
}

describe("buildIssueUrl", () => {
  it("targets the bug report template on this repository", () => {
    const url = buildIssueUrl(draft);
    expect(
      url.startsWith("https://github.com/Drakaniia/cmis/issues/new?")
    ).toBe(true);
    expect(paramsOf(url).get("template")).toBe("bug_report.yml");
  });

  it("prefixes the title with the bug tag", () => {
    expect(paramsOf(buildIssueUrl(draft)).get("title")).toBe(
      "[Bug] Expiry alert missing"
    );
  });

  it("encodes every template field id", () => {
    const params = paramsOf(buildIssueUrl(draft));
    expect(params.get("severity")).toBe(DEFAULT_SEVERITY);
    expect(params.get("summary")).toBe("Expiry alert missing");
    expect(params.get("repro")).toBe(draft.repro);
    expect(params.get("expected")).toBe(draft.expected);
    expect(params.get("actual")).toBe(draft.actual);
    expect(params.get("app_version")).toBe("0.1.0");
    expect(params.get("platform")).toBe("Desktop — Windows");
  });

  it("repeats the area param for multi-select", () => {
    expect(paramsOf(buildIssueUrl(draft)).getAll("area")).toEqual([
      AREA_OPTIONS[3],
      AREA_OPTIONS[4],
    ]);
  });

  it("omits blank optional values instead of pre-filling empties", () => {
    const params = paramsOf(
      buildIssueUrl({ ...draft, appVersion: "   ", areas: [] })
    );
    expect(params.has("app_version")).toBe(false);
    expect(params.getAll("area")).toEqual([]);
  });

  it("caps long fields so the URL stays within GitHub limits", () => {
    const params = paramsOf(
      buildIssueUrl({ ...draft, actual: "x".repeat(MAX_FIELD_LENGTH + 500) })
    );
    expect(params.get("actual")).toHaveLength(MAX_FIELD_LENGTH);
  });

  it("escapes characters that would break the query string", () => {
    const url = buildIssueUrl({
      ...draft,
      summary: 'Crash & burn "now" #1?',
    });
    expect(url).not.toContain('"now"');
    expect(paramsOf(url).get("summary")).toBe('Crash & burn "now" #1?');
  });
});

describe("clampField", () => {
  it("trims surrounding whitespace", () => {
    expect(clampField("  hello  ")).toBe("hello");
  });

  it("honours a custom cap", () => {
    expect(clampField("abcdef", 3)).toBe("abc");
  });
});

describe("validateIssueDraft", () => {
  it("accepts a complete draft", () => {
    expect(hasErrors(validateIssueDraft(draft))).toBe(false);
  });

  it("requires at least one area", () => {
    const errors = validateIssueDraft({ ...draft, areas: [] });
    expect(errors.areas).toBeTruthy();
  });

  it("requires every user-authored text field", () => {
    const errors = validateIssueDraft({
      ...draft,
      actual: " ",
      expected: "",
      repro: "\n",
      summary: "",
    });
    expect(errors.summary).toBeTruthy();
    expect(errors.repro).toBeTruthy();
    expect(errors.expected).toBeTruthy();
    expect(errors.actual).toBeTruthy();
    expect(hasErrors(errors)).toBe(true);
  });
});
