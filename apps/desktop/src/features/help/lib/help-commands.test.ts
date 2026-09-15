import { describe, expect, it, vi } from "vitest";

import {
  DOCS_ROUTE,
  HELP_COMMANDS,
  type HelpCommandHandlers,
  runHelpCommand,
} from "./help-commands";

function makeHandlers(): HelpCommandHandlers {
  return { navigate: vi.fn(), openReportIssue: vi.fn() };
}

describe("HELP_COMMANDS", () => {
  it("exposes exactly documentation and report-issue", () => {
    expect(HELP_COMMANDS.map((c) => c.label)).toEqual([
      "Documentation",
      "Report Issue…",
    ]);
  });

  it("groups every entry under the Help section", () => {
    for (const entry of HELP_COMMANDS) {
      expect(entry.section).toBe("Help");
    }
  });

  it("points Documentation at the in-app docs route", () => {
    const docs = HELP_COMMANDS.find((c) => c.label === "Documentation");
    expect(docs).toMatchObject({ kind: "route", to: DOCS_ROUTE });
  });
});

describe("runHelpCommand", () => {
  it("navigates for route entries", () => {
    const handlers = makeHandlers();
    const docs = HELP_COMMANDS.find((c) => c.label === "Documentation");
    expect(docs).toBeDefined();
    if (!docs) {
      return;
    }

    runHelpCommand(docs, handlers);

    expect(handlers.navigate).toHaveBeenCalledWith(DOCS_ROUTE);
    expect(handlers.openReportIssue).not.toHaveBeenCalled();
  });

  it("opens the dialog for help-action entries", () => {
    const handlers = makeHandlers();
    const report = HELP_COMMANDS.find((c) => c.label === "Report Issue…");
    expect(report).toBeDefined();
    if (!report) {
      return;
    }

    runHelpCommand(report, handlers);

    expect(handlers.openReportIssue).toHaveBeenCalledTimes(1);
    expect(handlers.navigate).not.toHaveBeenCalled();
  });
});
