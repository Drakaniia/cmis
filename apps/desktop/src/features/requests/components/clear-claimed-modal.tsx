import { ConfirmModal } from "@/features/admin/components/confirm-modal";

/**
 * CMIS-UI-05 F9/D15 — clearing the Claimed lane.
 *
 * A confirmation is warranted because the cards leave the board, even though
 * nothing is deleted: the hand-over history, the dispensing records and the
 * audit trail all stay in the Dispensing Log. So the primary action is *not*
 * destructive-styled — it is a board tidy-up, not a deletion — and the body says
 * exactly what stays and what goes.
 */
export function ClearClaimedModal({
  count,
  onConfirm,
  onOpenChange,
  open,
}: {
  count: number;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const noun = count === 1 ? "card" : "cards";
  return (
    <ConfirmModal
      confirmLabel="Clear board"
      description={
        <span className="space-y-2">
          <span className="block">
            {count} claimed {noun} will leave the board. The hand-over history
            and every dispensing record stay in the Dispensing Log — nothing is
            deleted.
          </span>
          <span className="block text-caption">
            Cards claimed in the last 24 hours are clearable; older ones already
            leave on their own. There is no undo for clearing the board.
          </span>
        </span>
      }
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
      open={open}
      title={`Clear ${count} claimed ${noun}?`}
    />
  );
}
