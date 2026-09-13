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
import { statusMetaOf } from "../types";
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
    <h3 className="font-semibold text-caption text-muted-foreground uppercase tracking-widest">
      {children}
    </h3>
  );
}

function StatusHistorySection({ history }: { history: StatusHistoryEntry[] }) {
  return (
    <section className="space-y-2">
      <SectionHeading>Status history</SectionHeading>
      <ol className="space-y-1.5">
        {history.map((entry) => (
          <li
            className="flex items-start gap-2"
            key={`${entry.at}-${entry.to}`}
          >
            <span
              aria-hidden
              className={cn(
                "mt-1 size-2 shrink-0 rounded-full",
                statusMetaOf(entry.to).accent
              )}
            />
            <span className="min-w-0">
              <span className="block text-caption">
                {compactDateTimeLabel(entry.at)} —{" "}
                {entry.from
                  ? `${statusMetaOf(entry.from).label} → ${statusMetaOf(entry.to).label}`
                  : "Submitted"}
                <span className="text-muted-foreground">
                  {" · "}
                  {entry.by}
                </span>
              </span>
              {entry.note ? (
                <span className="block text-caption text-muted-foreground">
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
    <section className="space-y-2">
      <SectionHeading>Internal notes</SectionHeading>
      <p className="text-caption text-muted-foreground">
        Staff-only. Never shown to the viewer.
      </p>
      {item.notes.length > 0 ? (
        <ul className="space-y-1.5">
          {item.notes.map((entry) => (
            <li
              className="rounded-md border border-border/60 bg-card px-2.5 py-2"
              key={`${entry.at}-${entry.author}`}
            >
              <p className="text-caption">{entry.text}</p>
              <p className="text-caption text-muted-foreground">
                {entry.author} · {compactDateTimeLabel(entry.at)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="block text-caption text-muted-foreground">
        Add note
        <textarea
          className="mt-1 min-h-[56px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          onChange={handleNoteChange}
          placeholder="Context for other staff…"
          value={note}
        />
      </label>
      <Button
        className="press-feedback"
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

function DispensingRecordSection({
  dispensing,
  unit,
}: {
  dispensing: DispensingRecord;
  unit: string;
}) {
  return (
    <section className="space-y-1">
      <SectionHeading>Dispensing record</SectionHeading>
      <div className="rounded-md border border-border/60 bg-card px-2.5 py-2">
        <p className="text-caption">
          Batch {dispensing.batch} · {dispensing.qty} {unit}
        </p>
        <p className="text-caption text-muted-foreground">
          Dispensed {compactDateTimeLabel(dispensing.at)} by {dispensing.staff}{" "}
          · exp {dispensing.expiry}
        </p>
      </div>
    </section>
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

  const primary = primaryAction(item.status);
  const structural = requestActions(item.status).filter(
    (action) => action.to && !action.destructive
  );
  const secondary = structural.filter((action) => action.id !== primary?.id);
  const deny = requestActions(item.status).find(
    (action) => action.id === "deny"
  );

  const transformOrigin = "center center";

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden
            className="fixed inset-0 z-50 bg-black/32"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={handleClose}
            transition={{ duration: 0.18 }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <motion.div
              animate="animate"
              aria-label={`Request details for ${item.requestor.name}`}
              aria-modal="true"
              className="surface-frosted relative flex max-h-[86vh] w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
              exit="exit"
              initial={reduceMotion ? "animate" : "initial"}
              role="dialog"
              style={{
                transformOrigin,
                willChange: "transform, opacity, filter",
                y,
              }}
              transition={sheetSpring}
              variants={materializeEnter}
            >
              {/* Close button — outside the drag region so it stays clickable */}
              <Button
                aria-label="Close"
                className="press-feedback absolute top-3 right-3 z-10"
                onClick={handleClose}
                size="icon-sm"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>

              {/* Drag region — swipe down to dismiss (§7, Apple §5/§6) */}
              <div
                className={cn(
                  "shrink-0 touch-none",
                  reduceMotion ? "" : "cursor-grab active:cursor-grabbing"
                )}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                <div className="flex justify-center pt-2 pb-1">
                  <div aria-hidden className="h-1 w-9 rounded-full bg-border" />
                </div>
                <div className="px-4 pb-2">
                  <h2 className="font-semibold text-foreground text-heading tracking-tight">
                    Request details
                  </h2>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-auto border-border/50 border-t p-4">
                <section className="space-y-1">
                  <h3 className="font-semibold text-caption text-muted-foreground uppercase tracking-widest">
                    Requestor
                  </h3>
                  <p className="font-semibold text-sm">
                    {item.requestor.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      — {item.requestor.id}
                    </span>
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {item.requestor.email}
                  </p>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-caption text-muted-foreground uppercase tracking-widest">
                    Request
                  </h3>
                  <p className="text-sm">
                    {item.medicine}{" "}
                    <span className="text-muted-foreground">
                      — {item.category}
                    </span>
                  </p>
                  <p className="text-caption text-muted-foreground">
                    Qty: {item.qty} {item.unit} · Request {item.id}
                  </p>
                  <p className="text-caption text-foreground">
                    Reason:{" "}
                    <span className="text-muted-foreground">{item.reason}</span>
                  </p>
                  {item.deniedReason ? (
                    <p className="text-caption text-destructive">
                      Denied — {item.deniedReason}
                      {item.deniedNote ? `: ${item.deniedNote}` : ""}
                    </p>
                  ) : null}
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-caption text-muted-foreground uppercase tracking-widest">
                    Submitted
                  </h3>
                  <p className="text-caption">
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

                {item.dispensing ? (
                  <DispensingRecordSection
                    dispensing={item.dispensing}
                    unit={item.unit}
                  />
                ) : null}

                {item.status === "claimed" ? (
                  <p className="text-caption text-muted-foreground">
                    Complete — the dispensing record above is the audit source.
                    Corrections go through the audit log.
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2 border-border/50 border-t px-4 py-3">
                {secondary.map((action) => (
                  <ActionButton
                    action={action}
                    item={item}
                    key={action.id}
                    onAction={onAction}
                    variant="outline"
                  />
                ))}
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
                  <ActionButton
                    action={primary}
                    item={item}
                    onAction={onAction}
                  />
                ) : null}
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
