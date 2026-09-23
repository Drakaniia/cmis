import { type HTMLAttributes, type RefObject, useMemo } from "react";

import type { Density } from "@/hooks/use-density";
import type { DragPhase } from "../hooks/use-card-drag/types";
import type { RequestAction } from "../transitions";
import type { RequestItem, RequestStatus } from "../types";
import type { RequestColumnGroup } from "./board-preview";
import { previewGroupsFor } from "./board-preview";
import { RequestColumn } from "./request-column";
import { RequestsEmptyState } from "./requests-empty-state";

/**
 * CMIS-UI-05 §2 — horizontal board. Native horizontal scroll with
 * `scroll-snap-type: x mandatory` between column drags (the drag engine
 * suspends snap while dragging); columns scroll vertically on their own.
 *
 * Drag state arrives as flat props rather than a context so each column can
 * opt out of re-rendering: only the column under the pointer and the origin
 * column change their highlight when the target moves.
 *
 * While a card is in flight the board renders the *preview* order, not the
 * committed one: the card is already in its destination slot, so the drop has
 * nowhere left to jump to (CMIS-UI-05 §4.1).
 */
export function RequestBoard({
  boardRef,
  cardHandlers,
  deniedCollapsed,
  density,
  dragPhase,
  draggedCardId,
  dropIndex,
  dropValid,
  filteredCount,
  groups,
  illegalStatuses,
  now,
  onAction,
  onClearClaimed,
  onClearFilters,
  onDropTargetStatus,
  onKeyboardMove,
  onOpen,
  onRegisterColumn,
  onToggleDenied,
  onToggleSelect,
  selectedIds,
  shake,
  snapSuspended,
  totalVisible,
}: {
  boardRef: RefObject<HTMLDivElement | null>;
  cardHandlers?: (item: RequestItem) => HTMLAttributes<HTMLElement>;
  deniedCollapsed: boolean;
  density: Density;
  /** Board styling follows the phase, never "an overlay object exists" (D18). */
  dragPhase: DragPhase;
  /** The card currently in flight — ghosted where the preview has placed it. */
  draggedCardId: string | null;
  dropIndex: number | null;
  dropValid: boolean;
  filteredCount: number;
  groups: RequestColumnGroup[];
  /** Lanes that cannot accept the card in flight (F3.2). */
  illegalStatuses: ReadonlySet<RequestStatus>;
  now: number;
  onAction: (item: RequestItem, action: RequestAction) => void;
  /** F9 — the Claimed lane's clear action. */
  onClearClaimed: () => void;
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
  /**
   * True for as long as anything is in the air — including the settle of a
   * committed move. Re-arming `snap-mandatory` mid-settle makes the browser
   * re-snap the board under the landing card, which moves every lane and turns
   * a clean landing into a correction jump (Apple §3).
   */
  snapSuspended: boolean;
  totalVisible: number;
}) {
  const dragging = dragPhase === "dragging";
  const previewGroups = useMemo(
    () =>
      previewGroupsFor(
        groups,
        draggedCardId,
        dropValid ? onDropTargetStatus : null,
        dropIndex
      ),
    [groups, draggedCardId, dropValid, onDropTargetStatus, dropIndex]
  );
  // A drag suspends scroll-snap; otherwise the board yanks the column back
  // under the card's home lane mid-gesture (Apple §3: don't fight the user).
  const className = useMemo(
    () =>
      `h-full overflow-x-auto overflow-y-hidden bg-gradient-to-b from-background/50 to-muted/20 px-3 pt-3 pb-4 ${
        snapSuspended ? "snap-none" : "snap-x snap-mandatory"
      }`,
    [snapSuspended]
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
      <div className="flex h-full min-h-0 gap-3">
        {previewGroups.map((group) => (
          <RequestColumn
            anySelected={selectedIds.size > 0}
            cardHandlers={cardHandlers}
            collapsed={group.column.isOffFlow && deniedCollapsed}
            column={group.column}
            count={group.count}
            density={density}
            draggedCardId={draggedCardId}
            dropValid={dropValid}
            illegal={dragging && illegalStatuses.has(group.column.status)}
            isTarget={onDropTargetStatus === group.column.status}
            items={group.items}
            key={group.column.status}
            now={now}
            onAction={onAction}
            onClearClaimed={
              group.column.status === "claimed" ? onClearClaimed : undefined
            }
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
