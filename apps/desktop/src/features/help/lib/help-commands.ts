/**
 * Help entries for the ⌘K command palette.
 *
 * Kept out of the palette component so the entry model and its dispatch can be
 * unit-tested without rendering, and so both actions stay in lockstep with the
 * header dropdown.
 */

import { BookOpenText, Bug, type LucideIcon } from "lucide-react";

export const HELP_SECTION = "Help";

export const DOCS_ROUTE = "/docs";

interface HelpCommandBase {
  icon: LucideIcon;
  label: string;
  section: string;
}

export interface HelpRouteCommand extends HelpCommandBase {
  kind: "route";
  to: string;
}

export interface HelpActionCommand extends HelpCommandBase {
  action: "report-issue";
  kind: "help-action";
}

export type HelpCommandEntry = HelpRouteCommand | HelpActionCommand;

export const HELP_COMMANDS: HelpCommandEntry[] = [
  {
    icon: BookOpenText,
    kind: "route",
    label: "Documentation",
    section: HELP_SECTION,
    to: DOCS_ROUTE,
  },
  {
    action: "report-issue",
    icon: Bug,
    kind: "help-action",
    label: "Report Issue…",
    section: HELP_SECTION,
  },
];

export interface HelpCommandHandlers {
  navigate: (to: string) => void;
  openReportIssue: () => void;
}

/** Dispatch a palette entry that belongs to the Help section. */
export function runHelpCommand(
  entry: HelpCommandEntry,
  handlers: HelpCommandHandlers
): void {
  if (entry.kind === "route") {
    handlers.navigate(entry.to);
    return;
  }
  handlers.openReportIssue();
}
