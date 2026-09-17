import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useDensity } from "@/hooks/use-density";
import { acceptsTypedText } from "@/lib/typed-text";
import { useCardDrag } from "../hooks/use-card-drag";
import { useDispense } from "../hooks/use-dispense";
import { useNow } from "../hooks/use-now";
import type { DispenseOutcome } from "../hooks/use-request-board";
import { countInStatus, useRequestBoard } from "../hooks/use-request-board";
import { useRequestFilters } from "../hooks/use-request-filters";
import { useRequestPersistence } from "../hooks/use-request-persistence";
import { useNewRequestDialog } from "../new-request-dialog-context";
import { deleteRequest } from "../persistence";
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
import { CancelRequestModal } from "./cancel-request-modal";
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

/** Drops that must be confirmed before they commit — a hand-over deducts stock. */
const DEFERRED_DROP_STATUSES: RequestStatus[] = ["claimed"];

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
  const persistence = useRequestPersistence([]);
  const board = useRequestBoard([], persistence.persist);
  const dispense = useDispense();
  const navigate = useNavigate();
  const search: RequestsSearch = useSearch({ from: to });
  // The same dialog Ctrl+N opens — the board offers it as a button so creating a
  // request does not require knowing the shortcut (F1).
  const { openNewRequest } = useNewRequestDialog();

  // Deep-linked filters seed the initial state; later edits flow back to the URL.
  const [initialFilters] = useState(() => filtersFromSearch(search));
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

  const [deniedCollapsed, setDeniedCollapsed] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const [denyTarget, setDenyTarget] = useState<{
    ids: string[];
    label: string;
  } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<RequestItem | null>(null);
  const [dispenseId, setDispenseId] = useState<string | null>(null);
  const [batchDispenseOpen, setBatchDispenseOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const boardRef = useRef<HTMLDivElement | null>(null);

  // Rows read from disk replace the mock seed, unless the user got there first.
  const { replaceAll } = board;
  useEffect(() => {
    if (persistence.hydrated) {
      replaceAll(persistence.hydrated);
    }
  }, [persistence.hydrated, replaceAll]);

  const commitMove = useCallback(
    (item: RequestItem, status: RequestStatus, index: number) => {
      // Moving into Claimed is a hand-over: it deducts stock, so it never
      // happens on a bare status flip. The confirmation shows the FEFO plan and
      // commits it (F7/F10).
      if (status === "claimed") {
        setDispenseId(item.id);
        return;
      }
      const outcome = board.moveRequestAt(item.id, status, index);
      if (!outcome.ok) {
        toast.error(FORBIDDEN_MESSAGE);
        return;
      }
      const { label } = statusMetaOf(status);
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
    deferredStatuses: DEFERRED_DROP_STATUSES,
    onCommit: useCallback(
      (id: string, status: RequestStatus, index: number) => {
        const item = board.items.find((candidate) => candidate.id === id);
        if (item) {
          commitMove(item, status, index);
        }
      },
      [board.items, commitMove]
    ),
    // Dropping into Claimed needs the hand-over plan accepted first, so the card
    // springs back and the confirmation opens (F10).
    onDeferred: useCallback((id: string) => setDispenseId(id), []),
    onForbidden: useCallback((status: RequestStatus) => {
      toast.error(FORBIDDEN_MESSAGE);
      setAnnouncement(
        `Cannot move to ${statusMetaOf(status).label}. ${FORBIDDEN_MESSAGE}`
      );
    }, []),
  });

  useEffect(() => {
    const next = searchFromFilters(filters);
    if (!requestsSearchEquals(next, search)) {
      // Filters stay bookmarkable and shareable between the two routes (§5).
      navigate({ replace: true, search: next, to });
    }
  }, [filters, navigate, search, to]);

  const groups = useMemo(
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

  const availableBatchActions = useMemo(
    () => batchActions(board.selectedItems.map((item) => item.status)),
    [board.selectedItems]
  );

  /** Ctrl/⌘+A — the board's own select-all, scoped to what's visible. */
  useEffect(() => {
    function handleSelectAllShortcut(event: KeyboardEvent) {
      if (
        !(
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "a"
        ) ||
        acceptsTypedText(event.target)
      ) {
        return;
      }
      event.preventDefault();
      const ids = visibleItems.map((item) => item.id);
      board.selectMany(ids, true);
      setAnnouncement(`${ids.length} visible requests selected.`);
    }
    document.addEventListener("keydown", handleSelectAllShortcut);
    return () => {
      document.removeEventListener("keydown", handleSelectAllShortcut);
    };
  }, [visibleItems, board]);

  const { consumeSuppressedClick, animateMove } = drag;

  const handleOpen = useCallback(
    (item: RequestItem, rect: DOMRect | null) => {
      // Suppress the click that follows a drag-cancel gesture — the card
      // lifted but the user released without committing a move.
      if (consumeSuppressedClick()) {
        return;
      }
      setOriginRect(rect);
      setOpenId(item.id);
    },
    [consumeSuppressedClick]
  );

  const handleMove = useCallback(
    (item: RequestItem, target: RequestStatus) => {
      commitMove(item, target, countInStatus(board.items, target));
    },
    [board.items, commitMove]
  );

  const handleKeyboardMove = useCallback(
    (item: RequestItem, direction: -1 | 1, rect: DOMRect) => {
      const target = keyboardTargetStatus(item.status, direction);
      if (!target) {
        setAnnouncement(
          `No column to the ${direction > 0 ? "right" : "left"} of ${statusMetaOf(item.status).label}.`
        );
        return;
      }
      // Keyboard move into Claimed goes through the same confirmation as a drop.
      if (target === "claimed") {
        setDispenseId(item.id);
        return;
      }
      animateMove(item, target, rect, countInStatus(board.items, target));
    },
    [animateMove, board.items]
  );

  const handleAction = useCallback(
    (item: RequestItem, action: RequestAction) => {
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
      if (action.id === "cancel") {
        setOpenId(null);
        setCancelTarget(item);
        return;
      }
      if (action.to) {
        handleMove(item, action.to);
      }
    },
    [handleMove]
  );

  const handleBatchAction = useCallback(
    (action: BatchAction) => {
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
      const { label } = statusMetaOf(action.to);
      setAnnouncement(`${moved} requests moved to ${label}.`);
      toast.success(`${moved} moved to ${label}`, {
        action: { label: "Undo", onClick: () => board.undoLastMove() },
      });
    },
    [board.moveRequests, board.selectedItems, board.undoLastMove]
  );

  const handleDenyConfirm = useCallback(
    (reason: Parameters<typeof board.denyRequests>[1], note: string) => {
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
    },
    [board.clearSelection, board.denyRequests, denyTarget]
  );

  /**
   * Deducts stock for each hand-over, then records it on the board.
   *
   * The order matters: stock moves first, the card second. A card that says
   * Claimed while the shelf still holds the stock is the bug being fixed; the
   * reverse — deducted but the card unmoved — is the safer failure (F7).
   */
  const runDispense = useCallback(
    async (targets: RequestItem[]) => {
      let attempts: Awaited<ReturnType<typeof dispense>>;
      try {
        attempts = await dispense(targets);
      } catch {
        // A build with no database cannot read the shelf, so it must not claim
        // to have moved it.
        toast.error("Could not dispense", {
          description:
            "The shelf could not be read — no stock was deducted and no card moved.",
        });
        return;
      }
      const outcomes: { id: string; outcome: DispenseOutcome }[] = [];
      const failures: string[] = [];
      for (const attempt of attempts) {
        if (attempt.ok && attempt.outcome) {
          outcomes.push({ id: attempt.id, outcome: attempt.outcome });
        } else {
          failures.push(attempt.error ?? "Could not be dispensed");
        }
      }

      const applied = board.markDispensedMany(outcomes);
      if (applied > 0) {
        const partials = outcomes.filter(
          (entry) => entry.outcome.remainingQty > 0
        );
        setAnnouncement(
          `${applied} request${applied === 1 ? "" : "s"} dispensed and stock deducted.` +
            (partials.length > 0
              ? ` ${partials.length} partial — still in Ready to Claim.`
              : "")
        );
        if (partials.length === 0) {
          toast.success(`${applied} dispensed`, {
            description: "Stock deducted and the hand-over recorded",
          });
        } else {
          toast.success(`${applied} dispensed — ${partials.length} partially`, {
            description: `${partials
              .map((entry) => `${entry.outcome.remainingQty} still outstanding`)
              .join(", ")} · stays in Ready to Claim`,
          });
        }
        board.clearSelection();
      }

      if (failures.length > 0) {
        toast.error(`${failures.length} could not be dispensed`, {
          description: failures[0],
        });
      }
    },
    [board, dispense]
  );

  const handleDispenseConfirm = useCallback(() => {
    if (!dispenseItem) {
      return;
    }
    setDispenseId(null);
    runDispense([dispenseItem]).catch(() => undefined);
  }, [dispenseItem, runDispense]);

  const handleBatchDispenseConfirm = useCallback(
    (items: RequestItem[]) => {
      setBatchDispenseOpen(false);
      runDispense(items).catch(() => undefined);
    },
    [runDispense]
  );

  /**
   * F6 — Cancel deletes a Pending request. The row goes first: dropping it from
   * the board while the delete failed would show a removal that never happened.
   */
  const handleCancelConfirm = useCallback(async () => {
    const target = cancelTarget;
    setCancelTarget(null);
    if (!target) {
      return;
    }
    const deleted = await deleteRequest(target.id);
    if (!deleted) {
      // The board keeps the card: showing it removed while the row survived
      // would be a lie the next restart would correct.
      toast.error("Could not cancel the request", {
        description: "Nothing was deleted — this build has no database.",
      });
      return;
    }
    board.removeRequests([target.id]);
    setAnnouncement(`Request ${target.id} cancelled and deleted.`);
    toast.success("Request cancelled", {
      description: `${target.medicine} · ${target.id}`,
    });
  }, [board, cancelTarget]);

  const handleCancelOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setCancelTarget(null);
    }
  }, []);

  /** The modal's confirm takes no arguments, so the promise is contained here. */
  const handleCancelConfirmClick = useCallback(() => {
    handleCancelConfirm().catch(() => undefined);
  }, [handleCancelConfirm]);

  const handleToggleDenied = useCallback(() => {
    setDeniedCollapsed((value) => !value);
  }, []);

  const handleDetailOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setOpenId(null);
    }
  }, []);

  const handleDenyOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setDenyTarget(null);
    }
  }, []);

  const handleDispenseOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setDispenseId(null);
    }
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <RequestsFilterBar
        activeChips={activeChips}
        categories={categories}
        filters={filters}
        onCategoryChange={setCategory}
        onClearFilters={clearFilters}
        onNewRequest={openNewRequest}
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

      <div className="min-h-0 flex-1 overflow-hidden">
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
          onToggleDenied={handleToggleDenied}
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
        onOpenChange={handleDetailOpenChange}
        open={openId !== null}
        originRect={originRect}
      />

      <CancelRequestModal
        onConfirm={handleCancelConfirmClick}
        onOpenChange={handleCancelOpenChange}
        open={cancelTarget !== null}
        requestLabel={
          cancelTarget
            ? `${cancelTarget.medicine} · ${cancelTarget.id}`
            : "This request"
        }
      />

      <DenyRequestModal
        count={denyTarget?.ids.length ?? 1}
        onConfirm={handleDenyConfirm}
        onOpenChange={handleDenyOpenChange}
        open={denyTarget !== null}
        originRect={originRect}
        requestLabel={denyTarget?.label ?? ""}
      />

      <DispenseRequestModal
        onConfirm={handleDispenseConfirm}
        onOpenChange={handleDispenseOpenChange}
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
