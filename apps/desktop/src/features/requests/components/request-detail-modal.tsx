import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { X } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  type ChangeEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  materializeEnter,
  project,
  rubberband,
  sheetSpring,
} from "@/lib/motion";
import { absoluteDateTimeLabel, compactDateTimeLabel } from "../format";
import type { RequestAction } from "../transitions";
import { primaryAction, requestActions } from "../transitions";
import type {
  DispensingRecord,
  RequestItem,
  StatusHistoryEntry,
} from "../types";
import {
  dispensedTotal,
  isPartiallyDispensed,
  QUICK_DEDUCT_LABEL,
  requestorLabel,
  requestQuantityLabel,
  statusMetaOf,
} from "../types";
import { RequestStatusBadge } from "./request-status-badge";

/**
 * CMIS-UI-05 §7 — Request detail. Frosted modal anchored to the source card
 * rect (Apple §7 anchored origins), interruptible: swipe down to dismiss with
 * velocity handoff, or close with the button / Escape.
 *
 * Forbidden actions are not rendered at all — no disabled-visible actions, so
 * there is no error surface to discover.
 */
function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-semibold text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

function StatusHistorySection({ history }: { history: StatusHistoryEntry[] }) {
  return (
    <section className="space-y-3 rounded-xl border border-border/40 bg-card/50 p-3 backdrop-blur-sm">
      <SectionHeading>Status history</SectionHeading>
      <ol className="relative space-y-0 border-l border-border/40 pl-4">
        {history.map((entry, idx) => (
          <li
            className="relative flex items-start gap-3 pb-4 last:pb-0"
            key={`${entry.at}-${entry.to}`}
          >
            <span
              aria-hidden
              className={cn(
                "absolute -left-[21px] mt-1 size-2.5 shrink-0 rounded-full ring-2 ring-card shadow-[0_0_6px_currentColor]",
                statusMetaOf(entry.to).accent,
                idx === history.length - 1 && "animate-pulse"
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] leading-[1.4] tracking-[0.01em]">
                <span className="font-medium text-foreground">
                  {entry.from
                    ? `${statusMetaOf(entry.from).label} → ${statusMetaOf(entry.to).label}`
                    : "Submitted"}
                </span>
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-[0.02em] text-muted-foreground">
                  {compactDateTimeLabel(entry.at)}
                </span>
                <span className="ml-1 text-muted-foreground">· {entry.by}</span>
              </span>
              {entry.note ? (
                <span className="mt-1 block rounded-lg bg-muted/50 px-2 py-1 text-[12px] leading-[1.4] text-muted-foreground">
                  {entry.note}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function InternalNotesSection({
  item,
  note,
  onAddNote,
  onNoteChange,
}: {
  item: RequestItem;
  note: string;
  onAddNote: (id: string, text: string) => void;
  onNoteChange: (value: string) => void;
}) {
  const handleNoteChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      onNoteChange(event.target.value),
    [onNoteChange]
  );

  const handleAddNote = useCallback(
    () => onAddNote(item.id, note),
    [item.id, note, onAddNote]
  );

  return (
    <section className="space-y-3 rounded-xl border border-border/40 bg-card/50 p-3 backdrop-blur-sm">
      <SectionHeading>Internal notes</SectionHeading>
      <p className="text-[11px] tracking-[0.01em] text-muted-foreground">
        Staff-only · never shown to the viewer
      </p>
      {item.notes.length > 0 ? (
        <ul className="space-y-2">
          {item.notes.map((entry) => (
            <li
              className="rounded-xl border border-border/40 bg-card px-3 py-2.5 shadow-sm"
              key={`${entry.at}-${entry.author}`}
            >
              <p className="text-[13px] leading-[1.5] tracking-[0.01em] text-foreground">
                {entry.text}
              </p>
              <p className="mt-1 text-[11px] tracking-[0.01em] text-muted-foreground">
                {entry.author} · {compactDateTimeLabel(entry.at)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="block text-[12px] font-medium tracking-[0.01em] text-muted-foreground">
        Add note
        <textarea
          className="mt-1.5 min-h-[64px] w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[13px] leading-[1.5] shadow-[inset_0_1px_2px_oklch(0_0_0/0.04)] outline-none placeholder:text-muted-foreground/60 focus:border-ring/60 focus:bg-card focus:ring-2 focus:ring-ring/20"
          onChange={handleNoteChange}
          placeholder="Context for other staff…"
          value={note}
        />
      </label>
      <Button
        className="press-feedback rounded-full"
        disabled={!note.trim()}
        onClick={handleAddNote}
        size="sm"
        variant="outline"
      >
        Add note
      </Button>
    </section>
  );
}

function ActionButton({
  action,
  item,
  label,
  variant,
  onAction,
}: {
  action: RequestAction;
  item: RequestItem;
  label?: string;
  variant?: "outline" | "destructive";
  onAction: (item: RequestItem, action: RequestAction) => void;
}) {
  const handleAction = useCallback(
    () => onAction(item, action),
    [action, item, onAction]
  );
  return (
    <Button
      className="press-feedback"
      onClick={handleAction}
      size="sm"
      variant={variant}
    >
      {label ?? action.label}
    </Button>
  );
}

/**
 * Every hand-over, oldest first. A request can be dispensed more than once — a
 * partial takes what is on the shelf and leaves the remainder in Ready to Claim
 * — so this is a list rather than the single record it used to render (D14).
 */
function DispensingRecordsSection({
  records,
  unit,
}: {
  records: DispensingRecord[];
  unit: string;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border/40 bg-card/50 p-3 backdrop-blur-sm">
      <SectionHeading>
        {records.length === 1
          ? "Dispensing record"
          : `Dispensing records — ${records.length} hand-overs`}
      </SectionHeading>
      <ul className="space-y-2">
        {records.map((record) => (
          <li
            className="rounded-xl border border-border/40 bg-card px-3 py-2.5 shadow-sm"
            key={`${record.at}-${record.batch}`}
          >
            <p className="text-[13px] font-medium tracking-[-0.01em] text-foreground tabular-nums">
              {record.batch === "" ? "No batch recorded" : `Batch ${record.batch}`} · {record.qty}{" "}
              {unit}
            </p>
            <p className="mt-1 text-[11px] tracking-[0.01em] text-muted-foreground">
              Dispensed {compactDateTimeLabel(record.at)} by {record.staff} · exp {record.expiry}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The requestor block. An anonymous request is a first-class answer, not a blank
 * (D23): the name reads "Walk-in" and the empty fields are simply absent.
 */
function RequestorSection({ item }: { item: RequestItem }) {
  const id = item.requestor.id.trim();
  const email = item.requestor.email.trim();
  const anonymous = item.requestor.name.trim() === "";

  return (
    <section className="space-y-2 rounded-xl border border-border/40 bg-card/50 p-3 backdrop-blur-sm">
      <SectionHeading>Requestor</SectionHeading>
      <p className="font-semibold text-[14px] tracking-[-0.01em] text-foreground">
        {requestorLabel(item)}{" "}
        {id ? (
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] font-normal tracking-[0.02em] text-muted-foreground">
            {id}
          </span>
        ) : null}
      </p>
      {email ? (
        <p className="text-[12px] tracking-[0.01em] text-muted-foreground">{email}</p>
      ) : null}
      {anonymous ? (
        <p className="rounded-lg bg-amber-500/8 px-2.5 py-1.5 text-[11px] tracking-[0.01em] text-amber-700 dark:text-amber-300">
          Anonymous — no requestor details were recorded.
        </p>
      ) : null}
    </section>
  );
}

function RequestSection({ item }: { item: RequestItem }) {
  const reason = item.reason.trim();
  const quickDeduct = item.source === "quick-deduct";

  return (
    <section className="space-y-2 rounded-xl border border-border/40 bg-card/50 p-3 backdrop-blur-sm">
      <SectionHeading>Request</SectionHeading>
      <p className="text-[13px] font-medium tracking-[-0.01em] text-foreground">
        {item.medicine}{" "}
        <span className="rounded-full border border-border/60 bg-card px-2 py-0.5 text-[11px] tracking-[0.01em] text-muted-foreground">
          {item.category}
        </span>
      </p>
      <p className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/60 px-2.5 py-1 text-[11px] tracking-[0.01em] text-foreground tabular-nums">
        {requestQuantityLabel(item)} · {item.id}
      </p>
      <p className="text-[12px] leading-[1.5] text-foreground">
        <span className="font-medium">Reason:</span>{" "}
        <span className="text-muted-foreground">{reason || "—"}</span>
      </p>
      {quickDeduct ? (
        <p className="rounded-lg border border-amber-500/15 bg-amber-500/8 px-2.5 py-1.5 text-[11px] leading-[1.4] tracking-[0.01em] text-amber-700 dark:text-amber-300">
          {QUICK_DEDUCT_LABEL} — taken straight off the shelf at the counter, outside the approval
          workflow.
        </p>
      ) : null}
      {item.deniedReason ? (
        <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-[11px] leading-[1.4] tracking-[0.01em] text-destructive">
          Denied — {item.deniedReason}
          {item.deniedNote ? `: ${item.deniedNote}` : ""}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Footer actions, derived here so the modal body stays presentational and only
 * legal moves are ever rendered — never a disabled button.
 */
function DetailFooter({
  item,
  onAction,
}: {
  item: RequestItem;
  onAction: (item: RequestItem, action: RequestAction) => void;
}) {
  const actions = requestActions(item.status);
  const primary = primaryAction(item.status);
  const secondary = actions.filter(
    (action) => action.to && !action.destructive && action.id !== primary?.id
  );
  const cancel = actions.find((action) => action.id === "cancel");
  const deny = actions.find((action) => action.id === "deny");

  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-border/40 border-t bg-card/60 px-4 py-3 backdrop-blur-[8px]">
      {secondary.map((action) => (
        <ActionButton
          action={action}
          item={item}
          key={action.id}
          onAction={onAction}
          variant="outline"
        />
      ))}
      {cancel ? (
        <ActionButton
          action={cancel}
          item={item}
          label="Cancel request"
          onAction={onAction}
          variant="destructive"
        />
      ) : null}
      {deny ? (
        <ActionButton
          action={deny}
          item={item}
          label="Deny"
          onAction={onAction}
          variant="destructive"
        />
      ) : null}
      {primary ? (
        <ActionButton action={primary} item={item} onAction={onAction} />
      ) : null}
    </div>
  );
}

/**
 * CMIS-UI-05 §7 — Request detail. Frosted modal anchored to the source card
 * rect (Apple §7 anchored origins); dismiss by swiping down with velocity
 * handoff, or by the close button / Escape.
 *
 * Forbidden actions are not rendered at all — no disabled-visible actions, so
 * there is no error surface to discover.
 */
export function RequestDetailModal({
  item,
  onAction,
  onAddNote,
  onOpenChange,
  open,
  originRect: _originRect,
}: {
  item: RequestItem | null;
  onAction: (item: RequestItem, action: RequestAction) => void;
  onAddNote: (id: string, text: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  originRect: DOMRect | null;
}) {
  const y = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const [note, setNote] = useState("");
  const startYRef = useRef<number | null>(null);
  const historyRef = useRef<{ t: number; y: number }[]>([]);

  useEffect(() => {
    if (open) {
      setNote("");
      y.set(0);
    }
  }, [open, y]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleAddNoteWithReset = useCallback(
    (id: string, text: string) => {
      onAddNote(id, text);
      setNote("");
    },
    [onAddNote]
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent) => {
      if (reduceMotion) {
        return;
      }
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      startYRef.current = event.clientY;
      historyRef.current = [];
    },
    [reduceMotion]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (startYRef.current === null) {
        return;
      }
      const delta = event.clientY - startYRef.current;
      if (delta < 0) {
        // Resist upward overscroll — Apple §9 rubber-banding.
        y.set(rubberband(delta, 420));
        return;
      }
      historyRef.current.push({ t: Date.now(), y: delta });
      if (historyRef.current.length > 8) {
        historyRef.current.shift();
      }
      y.set(delta);
    },
    [y]
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      if (startYRef.current === null) {
        return;
      }
      const delta = event.clientY - startYRef.current;
      startYRef.current = null;

      const history = historyRef.current;
      const last = history.at(-1);
      const previous = history.at(Math.max(0, history.length - 3));
      let releaseVelocity = 0;
      if (last && previous) {
        const dt = Math.max(1, last.t - previous.t);
        releaseVelocity = ((last.y - previous.y) / dt) * 1000;
      }

      // Apple §6 — decide from where the gesture is going, not where it stopped.
      const projected = delta + project(releaseVelocity);
      if (projected > 80 || releaseVelocity > 200) {
        onOpenChange(false);
      }
      y.set(0);
    },
    [onOpenChange, y]
  );

  if (!item) {
    return null;
  }

  const transformOrigin = (() => {
    if (!open || !_originRect) return "center center";
    const cx = _originRect.left + _originRect.width / 2;
    const cy = _originRect.top + _originRect.height / 2;
    const vw = typeof window !== "undefined" ? window.innerWidth : 800;
    const vh = typeof window !== "undefined" ? window.innerHeight : 600;
    const ox = ((cx / vw) * 100).toFixed(1);
    const oy = ((cy / vh) * 100).toFixed(1);
    return `${ox}% ${oy}%`;
  })();

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={handleClose}
            transition={{ duration: 0.22 }}
          />
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
            onClick={handleClose}
          >
            <motion.div
              animate="animate"
              aria-label={`Request details for ${requestorLabel(item)}`}
              aria-modal="true"
              className="surface-frosted relative flex max-h-[86vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[20px] border border-white/20 shadow-[0_8px_32px_oklch(0_0_0/0.12),0_1px_4px_oklch(0_0_0/0.08),inset_0_1px_0_oklch(1_0_0/0.6)] dark:border-white/10"
              exit="exit"
              initial={reduceMotion ? "animate" : "initial"}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              style={{
                transformOrigin,
                willChange: "transform, opacity, filter",
                y,
              }}
              transition={sheetSpring}
              variants={materializeEnter}
            >
              <Button
                aria-label="Close"
                className="press-feedback absolute top-3 right-3 z-10 rounded-full bg-muted/80 backdrop-blur"
                onClick={handleClose}
                size="icon-sm"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>

              <div
                className={cn(
                  "shrink-0 touch-none border-b border-border/40 bg-card/40 backdrop-blur-[8px]",
                  reduceMotion ? "" : "cursor-grab active:cursor-grabbing"
                )}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                <div className="flex justify-center pt-3 pb-1">
                  <div aria-hidden className="h-1 w-10 rounded-full bg-border/60" />
                </div>
                <div className="px-5 pb-3">
                  <h2 className="font-semibold text-[17px] tracking-[-0.02em] text-foreground">
                    Request details
                  </h2>
                  <p className="mt-0.5 text-[12px] tracking-[0.01em] text-muted-foreground">
                    {item.id} · {statusMetaOf(item.status).label}
                  </p>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-auto bg-gradient-to-b from-transparent to-muted/10 p-4">
                <RequestorSection item={item} />

                <RequestSection item={item} />

                <section className="space-y-2 rounded-xl border border-border/40 bg-card/50 p-3 backdrop-blur-sm">
                  <SectionHeading>Submitted</SectionHeading>
                  <p className="font-mono text-[12px] tracking-[0.01em] text-foreground tabular-nums">
                    {absoluteDateTimeLabel(item.submittedAt)}
                  </p>
                  <RequestStatusBadge size="md" status={item.status} />
                </section>

                <StatusHistorySection history={item.history} />

                <InternalNotesSection
                  item={item}
                  note={note}
                  onAddNote={handleAddNoteWithReset}
                  onNoteChange={setNote}
                />

                {item.dispensingRecords.length > 0 ? (
                  <DispensingRecordsSection
                    records={item.dispensingRecords}
                    unit={item.unit}
                  />
                ) : null}

                {isPartiallyDispensed(item) ? (
                  <p className="rounded-xl border border-[var(--warning)]/20 bg-[var(--warning)]/8 px-3 py-2.5 text-[12px] leading-[1.5] tracking-[0.01em] text-amber-700 dark:text-amber-300">
                    Partly dispensed —{" "}
                    <span className="font-semibold tabular-nums">{dispensedTotal(item)}</span>{" "}
                    {item.baseUnit ?? item.unit} handed over so far, {requestQuantityLabel(item)}{" "}
                    still waiting.
                  </p>
                ) : null}

                {item.status === "claimed" ? (
                  <p className="rounded-xl bg-muted/40 px-3 py-2 text-[11px] leading-[1.5] tracking-[0.01em] text-muted-foreground">
                    Complete — the dispensing record above is the audit source. Corrections go
                    through the audit log.
                  </p>
                ) : null}
              </div>

              <DetailFooter item={item} onAction={onAction} />
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
