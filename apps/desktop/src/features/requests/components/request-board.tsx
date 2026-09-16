import { type HTMLAttributes, type RefObject, useMemo } from "react";

import type { Density } from "@/hooks/use-density";
import type { RequestAction } from "../transitions";
import type { RequestColumnMeta, RequestItem, RequestStatus } from "../types";
import { RequestColumn } from "./request-column";
import { RequestsEmptyState } from "./requests-empty-state";

export interface RequestColumnGroup {
  column: RequestColumnMeta;
  items: RequestItem[];
  total: number;
}

/**
 * CMIS-UI-05 §2 — horizontal board. Native horizontal scroll with
 * `scroll-snap-type: x mandatory` between column drags (the drag engine
 * suspends snap while dragging); columns scroll vertically on their own.
 *
 * Drag state arrives as flat props rather than a context so each column can
 * opt out of re-rendering: only the column under the pointer and the origin
 * column change their highlight when the target moves.
 */
export function RequestBoard({
  boardRef,
  cardHandlers,
  deniedCollapsed,
  density,
  dragActive,
  draggedCardId,
  dropIndex,
  dropValid,
  filteredCount,
  groups,
  now,
  onAction,
  onClearFilters,
  onDropTargetStatus,
  onKeyboardMove,
  onOpen,
  onRegisterColumn,
  onToggleDenied,
  onToggleSelect,
  selectedIds,
  shake,
  totalVisible,
}: {
  boardRef: RefObject<HTMLDivElement | null>;
  cardHandlers?: (item: RequestItem) => HTMLAttributes<HTMLElement>;
  deniedCollapsed: boolean;
  density: Density;
  dragActive: boolean;
  draggedCardId: string | null;
  dropIndex: number | null;
  dropValid: boolean;
  filteredCount: number;
  groups: RequestColumnGroup[];
  now: number;
  onAction: (item: RequestItem, action: RequestAction) => void;
  onClearFilters: () => void;
  /** Status of the column currently under the pointer, if any. */
  onDropTargetStatus: RequestStatus | null;
  onKeyboardMove: (item: RequestItem, direction: -1 | 1, rect: DOMRect) => void;
  onOpen: (item: RequestItem, rect: DOMRect | null) => void;
  onRegisterColumn: (
    status: RequestStatus,
    element: HTMLElement | null
  ) => void;
  onToggleDenied: () => void;
  onToggleSelect: (id: string) => void;
  selectedIds: ReadonlySet<string>;
  /** Status whose header should shake after a forbidden drop. */
  shake: RequestStatus | null;
  totalVisible: number;
}) {
  // A drag suspends scroll-snap; otherwise the board yanks the column back
  // under the card's home lane mid-gesture (Apple §3: don't fight the user).
  const className = useMemo(
    () =>
      `h-full overflow-x-auto overflow-y-hidden px-3 pb-3 ${
        dragActive ? "snap-none" : "snap-x snap-mandatory"
      }`,
    [dragActive]
  );

  if (totalVisible === 0) {
    return (
      <div
        className="flex h-full min-h-[420px] w-full items-center justify-center p-6"
        ref={boardRef}
      >
        <RequestsEmptyState variant="board" />
      </div>
    );
  }

  if (filteredCount === 0) {
    return (
      <div
        className="flex h-full min-h-[420px] w-full items-center justify-center p-6"
        ref={boardRef}
      >
        <RequestsEmptyState
          onClearFilters={onClearFilters}
          variant="filtered"
        />
      </div>
    );
  }

  return (
    <section
      aria-label="Request queue board"
      className={className}
      ref={boardRef}
    >
      <div className="flex h-full min-h-0 gap-2">
        {groups.map((group) => (
          <RequestColumn
            anySelected={selectedIds.size > 0}
            cardHandlers={cardHandlers}
            collapsed={group.column.isOffFlow && deniedCollapsed}
            column={group.column}
            density={density}
            dragActive={dragActive}
            draggedCardId={draggedCardId}
            dropIndex={
              onDropTargetStatus === group.column.status ? dropIndex : null
            }
            dropValid={dropValid}
            isTarget={onDropTargetStatus === group.column.status}
            items={group.items}
            key={group.column.status}
            now={now}
            onAction={onAction}
            onKeyboardMove={onKeyboardMove}
            onOpen={onOpen}
            onRegisterColumn={onRegisterColumn}
            onToggleCollapsed={onToggleDenied}
            onToggleSelect={onToggleSelect}
            selectedIds={selectedIds}
            shake={shake === group.column.status}
            total={group.total}
          />
        ))}
      </div>
    </section>
  );
}
