import { TriangleAlert } from "lucide-react";

import type { SheetIssue } from "../../../creation/sheet-types";
import { plural } from "../summary-text";

export function rowIssue(
  issues: SheetIssue[],
  rowId: string,
  column: string
): string | null {
  const found = issues.find(
    (issue) => issue.rowId === rowId && issue.field.endsWith(`.${column}`)
  );
  return found?.message ?? null;
}

export function groupIssues(issues: SheetIssue[]): SheetIssue[] {
  return issues.filter((issue) => issue.rowId === undefined);
}

export function IssueChip({ issues }: { issues: SheetIssue[] }) {
  if (issues.length === 0) {
    return null;
  }
  return (
    <span
      aria-label={`${plural(issues.length, "issue", "issues")}: ${issues
        .map((issue) => issue.message)
        .join("; ")}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 font-medium text-[10px] text-destructive"
      role="status"
      title={issues.map((issue) => issue.message).join("\n")}
    >
      <TriangleAlert aria-hidden className="size-3" />
      {issues.length}
    </span>
  );
}
