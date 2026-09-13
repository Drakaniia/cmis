import { useNavigate, useSearch } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";

import { useDensity } from "@/hooks/use-density";
import { useCardDrag } from "../hooks/use-card-drag";
import { useNow } from "../hooks/use-now";
import type { DispensePayload } from "../hooks/use-request-board";
import { countInStatus, useRequestBoard } from "../hooks/use-request-board";
import { useRequestFilters } from "../hooks/use-request-filters";
import { useRequestPersistence } from "../hooks/use-request-persistence";
import { mockRequests } from "../mock";
import type { RequestsSearch } from "../request-search";
import {
  filtersFromSearch,
  requestsSearchEquals,
  searchFromFilters,
} from "../request-search";
import type { BatchAction, RequestAction } from "../transitions";
import { batchActions, canMove } from "../transitions";
import type { RequestItem, RequestStatus } from "../types";
import { REQUEST_COLUMNS, statusMetaOf } from "../types";
import { DenyRequestModal } from "./deny-request-modal";
import { DispenseBatchModal } from "./dispense-batch-modal";
import { DispenseRequestModal } from "./dispense-request-modal";
import { DragOverlayLayer } from "./drag-overlay";
import { RequestBoard } from "./request-board";
import { RequestDetailModal } from "./request-detail-modal";
import { RequestsBatchToolbar } from "./requests-batch-toolbar";
import { RequestsFilterBar } from "./requests-filter-bar";

const FORBIDDEN_MESSAGE =
  "Complete requests cannot be denied — use detail view audit correction.";

const COLUMN_ORDER: RequestStatus[] = REQUEST_COLUMNS.map(
  (column) => column.status
);

/** Nearest legal column in the requested direction, by board order. */
function keyboardTargetStatus(
  from: RequestStatus,
  direction: -1 | 1
): RequestStatus | null {
  const origin = COLUMN_ORDER.indexOf(from);
  const candidates = COLUMN_ORDER.map((status, index) => ({ index, status }))
    .filter(({ status }) => canMove(from, status))
    .sort((a, b) => a.index - b.index);
  if (direction > 0) {
    return candidates.find((entry) => entry.index > origin)?.status ?? null;
  }
  return (
    [...candidates].reverse().find((entry) => entry.index < origin)?.status ??
    null
  );
}

function acceptsTypedText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

/**
 * CMIS-UI-05 — the Request Queue board. Staff and Admin render the same
 * workspace; Admin-only scope differences land with the reports work.
 *
 * `to` is the route that rendered this board — it keeps the URL persistence in
 * §5 correctly typed for both the staff and admin mounts.
 */
export function RequestsPage({ to }: { to: "/admin/requests" }) {
  const { density } = useDensity();
  const now = useNow();
  const persistence = useRequestPersistence(mockRequests);
  const board = useRequestBoard(mockRequests, persistence.persist);
  const navigate = useNavigate();
  const search: RequestsSearch = useSearch({ from: to });

  // Deep-linked filters seed the initial state; later edits flow back to the URL.
  const [initialFilters] = React.useState(() => filtersFromSearch(search));
  const {
    activeChips,
    categories,
    clearFilters,
    filteredItems,
    filters,
    removeChip,
    setCategory,
    setCustomRange,
    setDatePreset,
    setRequestor,
    setSearch,
    visibleItems,
  } = useRequestFilters(board.items, now, initialFilters);

  const [deniedCollapsed, setDeniedCollapsed] = React.useState(true);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [originRect, setOriginRect] = React.useState<DOMRect | null>(null);
  const [denyTarget, setDenyTarget] = React.useState<{
    ids: string[];
    label: string;
  } | null>(null);
  const [dispenseId, setDispenseId] = React.useState<string | null>(null);
  const [batchDispenseOpen, setBatchDispenseOpen] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  const boardRef = React.useRef<HTMLDivElement | null>(null);

  // Rows read from disk replace the mock seed, unless the user got there first.
  const { replaceAll } = board;
  React.useEffect(() => {
    if (persistence.hydrated) {
      replaceAll(persistence.hydrated);
    }
  }, [persistence.hydrated, replaceAll]);

  const commitMove = React.useCallback(
    (item: RequestItem, status: RequestStatus, index: number) => {
      const outcome = board.moveRequestAt(item.id, status, index);
      if (!outcome.ok) {
        toast.error(FORBIDDEN_MESSAGE);
        return;
      }
      const label = statusMetaOf(status).label;
      setAnnouncement(
        `${item.medicine} for ${item.requestor.name} moved to ${label}.`
      );
      toast.success(`${item.requestor.name} → ${label}`, {
        action: { label: "Undo", onClick: () => board.undoLastMove() },
        description: item.medicine,
      });
    },
    [board]
  );

  const drag = useCardDrag({
    boardRef,
    onCommit: React.useCallback(
      (id: string, status: RequestStatus, index: number) => {
        const item = board.items.find((candidate) => candidate.id === id);
        if (item) {
          commitMove(item, status, index);
        }
      },
      [board.items, commitMove]
    ),
    onForbidden: React.useCallback((status: RequestStatus) => {
      toast.error(FORBIDDEN_MESSAGE);
      setAnnouncement(
        `Cannot move to ${statusMetaOf(status).label}. ${FORBIDDEN_MESSAGE}`
      );
    }, []),
  });

  React.useEffect(() => {
    const next = searchFromFilters(filters);
    if (!requestsSearchEquals(next, search)) {
      // Filters stay bookmarkable and shareable between the two routes (§5).
      navigate({ replace: true, search: next, to });
    }
  }, [filters, navigate, search, to]);

  const groups = React.useMemo(
    () =>
      REQUEST_COLUMNS.map((column) => ({
        column,
        items: filteredItems.filter((item) => item.status === column.status),
        total: visibleItems.filter((item) => item.status === column.status)
          .length,
      })),
    [filteredItems, visibleItems]
  );

  const openItem = board.items.find((item) => item.id === openId) ?? null;
  const dispenseItem =
    board.items.find((item) => item.id === dispenseId) ?? null;

  const availableBatchActions = React.useMemo(
    () => batchActions(board.selectedItems.map((item) => item.status)),
    [board.selectedItems]
  );

  /** Ctrl/⌘+A — the board's own select-all, scoped to what's visible. */
  function handleBoardKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (
      !((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") ||
      acceptsTypedText(event.target)
    ) {
      return;
    }
    event.preventDefault();
    const ids = visibleItems.map((item) => item.id);
    board.selectMany(ids, true);
    setAnnouncement(`${ids.length} visible requests selected.`);
  }

  function handleOpen(item: RequestItem, rect: DOMRect | null) {
    // Suppress the click that follows a drag-cancel gesture — the card
    // lifted but the user released without committing a move.
    if (drag.consumeSuppressedClick()) {
      return;
    }
    setOriginRect(rect);
    setOpenId(item.id);
  }

  function handleMove(item: RequestItem, target: RequestStatus) {
    commitMove(item, target, countInStatus(board.items, target));
  }

  function handleKeyboardMove(
    item: RequestItem,
    direction: -1 | 1,
    rect: DOMRect
  ) {
    const target = keyboardTargetStatus(item.status, direction);
    if (!target) {
      setAnnouncement(
        `No column to the ${direction > 0 ? "right" : "left"} of ${statusMetaOf(item.status).label}.`
      );
      return;
    }
    drag.animateMove(item, target, rect, countInStatus(board.items, target));
  }

  function handleAction(item: RequestItem, action: RequestAction) {
    if (action.id === "view" || action.id === "view-dispensing-record") {
      setOriginRect(null);
      setOpenId(item.id);
      return;
    }
    if (action.id === "deny") {
      setDenyTarget({
        ids: [item.id],
        label: `${item.medicine} — ${item.requestor.name}`,
      });
      setOpenId(null);
      return;
    }
    if (action.id === "dispense") {
      setDispenseId(item.id);
      setOpenId(null);
      return;
    }
    if (action.to) {
      handleMove(item, action.to);
    }
  }

  function handleBatchAction(action: BatchAction) {
    const ids = board.selectedItems.map((item) => item.id);
    if (ids.length === 0) {
      return;
    }
    if (action.to === "denied") {
      setOriginRect(null);
      setDenyTarget({
        ids,
        label: `${ids.length} selected requests`,
      });
      return;
    }
    if (action.to === "claimed") {
      setBatchDispenseOpen(true);
      return;
    }
    const moved = board.moveRequests(ids, action.to);
    if (moved === 0) {
      toast.error(FORBIDDEN_MESSAGE);
      return;
    }
    const label = statusMetaOf(action.to).label;
    setAnnouncement(`${moved} requests moved to ${label}.`);
    toast.success(`${moved} moved to ${label}`, {
      action: { label: "Undo", onClick: () => board.undoLastMove() },
    });
  }

  function handleDenyConfirm(
    reason: Parameters<typeof board.denyRequests>[1],
    note: string
  ) {
    if (!denyTarget) {
      return;
    }
    const count = board.denyRequests(denyTarget.ids, reason, note);
    if (count > 0) {
      setAnnouncement(`${count} requests denied.`);
      toast.success(`${count} request${count === 1 ? "" : "s"} denied`, {
        description: reason,
      });
      board.clearSelection();
    }
    setDenyTarget(null);
  }

  function handleDispenseConfirm(payload: DispensePayload) {
    if (!dispenseItem) {
      return;
    }
    const applied = board.dispenseRequest(dispenseItem.id, payload);
    if (applied) {
      setAnnouncement(
        `Dispensing logged for ${dispenseItem.medicine} for ${dispenseItem.requestor.name}.`
      );
      toast.success(`Dispensing logged for ${dispenseItem.medicine}`, {
        description: `Batch ${payload.batch} · ${payload.qty} ${dispenseItem.unit}`,
      });
    }
    setDispenseId(null);
  }

  function handleBatchDispenseConfirm(
    payloads: { id: string; payload: DispensePayload }[]
  ) {
    const applied = board.dispenseRequests(payloads);
    if (applied > 0) {
      setAnnouncement(`${applied} requests dispensed and moved to Claimed.`);
      toast.success(`${applied} requests dispensed`, {
        description: "Dispensing records logged",
      });
      board.clearSelection();
    }
    setBatchDispenseOpen(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <RequestsFilterBar
        activeChips={activeChips}
        categories={categories}
        filters={filters}
        onCategoryChange={setCategory}
        onClearFilters={clearFilters}
        onRemoveChip={removeChip}
        onRequestorChange={setRequestor}
        onSearchChange={setSearch}
        onSetCustomRange={setCustomRange}
        onSetDatePreset={setDatePreset}
      />

      {/* Live region — every structural change is announced (Apple §16). */}
      <p aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>

      <div
        className="min-h-0 flex-1 overflow-hidden"
        onKeyDown={handleBoardKeyDown}
      >
        <RequestBoard
          boardRef={boardRef}
          cardHandlers={drag.cardHandlers}
          deniedCollapsed={deniedCollapsed}
          density={density}
          dragActive={drag.isDragging}
          draggedCardId={drag.overlay?.item.id ?? null}
          dropIndex={drag.overlay?.target?.index ?? null}
          dropValid={drag.overlay?.target?.valid ?? false}
          filteredCount={filteredItems.length}
          groups={groups}
          now={now}
          onAction={handleAction}
          onClearFilters={clearFilters}
          onDropTargetStatus={drag.overlay?.target?.status ?? null}
          onKeyboardMove={handleKeyboardMove}
          onOpen={handleOpen}
          onRegisterColumn={drag.registerColumn}
          onToggleDenied={() => setDeniedCollapsed((value) => !value)}
          onToggleSelect={board.toggleSelect}
          selectedIds={board.selectedIds}
          shake={drag.shake}
          totalVisible={visibleItems.length}
        />
      </div>

      <RequestsBatchToolbar
        actions={availableBatchActions}
        count={board.selectedIds.size}
        onAction={handleBatchAction}
        onClearSelection={board.clearSelection}
      />

      {drag.overlay ? (
        <DragOverlayLayer
          dragX={drag.dragX}
          dragY={drag.dragY}
          handlers={drag.overlayHandlers(drag.overlay.item)}
          now={now}
          overlay={drag.overlay}
        />
      ) : null}

      <RequestDetailModal
        item={openItem}
        onAction={handleAction}
        onAddNote={board.addNote}
        onOpenChange={(next) => {
          if (!next) {
            setOpenId(null);
          }
        }}
        open={openId !== null}
        originRect={originRect}
      />

      <DenyRequestModal
        count={denyTarget?.ids.length ?? 1}
        onConfirm={handleDenyConfirm}
        onOpenChange={(next) => {
          if (!next) {
            setDenyTarget(null);
          }
        }}
        open={denyTarget !== null}
        originRect={originRect}
        requestLabel={denyTarget?.label ?? ""}
      />

      <DispenseRequestModal
        onConfirm={handleDispenseConfirm}
        onOpenChange={(next) => {
          if (!next) {
            setDispenseId(null);
          }
        }}
        open={dispenseId !== null}
        originRect={originRect}
        request={dispenseItem}
      />

      <DispenseBatchModal
        items={board.selectedItems.filter((item) => item.status === "ready")}
        onConfirm={handleBatchDispenseConfirm}
        onOpenChange={setBatchDispenseOpen}
        open={batchDispenseOpen}
      />
    </div>
  );
}
