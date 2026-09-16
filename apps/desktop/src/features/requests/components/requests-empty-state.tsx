import { Button } from "@cmis/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@cmis/ui/components/empty";
import { ClipboardList, SearchX } from "lucide-react";

/**
 * CMIS-UI-05 §9 — board-level empty states. Per-column empties live in
 * `request-column.tsx` as dashed placeholders.
 */
export function RequestsEmptyState({
  onClearFilters,
  variant,
}: {
  onClearFilters?: () => void;
  variant: "board" | "filtered";
}) {
  if (variant === "filtered") {
    return (
      <Empty className="w-full max-w-md border border-dashed bg-muted/20">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX />
          </EmptyMedia>
          <EmptyTitle>No requests match filters</EmptyTitle>
          <EmptyDescription>
            Nothing in the queue matches the current search, date range or
            category.
          </EmptyDescription>
        </EmptyHeader>
        {onClearFilters ? (
          <EmptyContent>
            <Button
              className="press-feedback"
              onClick={onClearFilters}
              size="sm"
              variant="outline"
            >
              Clear filters
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  }

  return (
    <Empty className="w-full max-w-md border border-dashed bg-muted/20">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ClipboardList />
        </EmptyMedia>
        <EmptyTitle>No requests yet</EmptyTitle>
        <EmptyDescription>
          When viewers submit requests, they&rsquo;ll appear here for review.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
