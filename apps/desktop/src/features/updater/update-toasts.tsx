import { Button } from "@cmis/ui/components/button";
import { toast } from "sonner";
import { UPDATER_ERROR_TOAST_ID, UPDATER_TOAST_ID } from "./types";

export function showCheckingToast(): void {
  toast.loading("Checking for updates…", { id: UPDATER_TOAST_ID });
}

export function showUpToDateToast(version: string): void {
  toast.success(`You're on the latest version (v${version})`, {
    description: "No update available.",
    id: UPDATER_TOAST_ID,
  });
}

export function showAvailableToast(
  version: string,
  opts: { onDownload: () => void; onViewNotes: () => void }
): void {
  toast(`Version ${version} available`, {
    action: {
      label: "Download now",
      onClick: opts.onDownload,
    },
    description: "A new version is ready to download.",
    id: UPDATER_TOAST_ID,
  });
}

export function showDownloadingToast(percent: number): void {
  toast.loading(`Downloading update… ${percent}%`, {
    description: percent >= 100 ? "Almost there…" : `${percent}% downloaded`,
    id: UPDATER_TOAST_ID,
  });
}

const NOTES_PREVIEW_LENGTH = 140;

/**
 * The update prompt, once the installer is on disk and waiting.
 *
 * A custom card rather than sonner's `action`/`cancel` pair because the two
 * answers here are not equal: applying the update is the primary action, and
 * keeping the current version is a plain, unemphasised exit. The card stays up
 * until one of them is chosen — an update that silently expires is an update
 * that never lands.
 */
export function showReadyToast(opts: {
  notes: string | null;
  onRestart: () => void;
  onUseCurrent: () => void;
  version: string;
}): void {
  const { notes, onRestart, onUseCurrent, version } = opts;
  const preview =
    notes && notes.length > NOTES_PREVIEW_LENGTH
      ? `${notes.slice(0, NOTES_PREVIEW_LENGTH)}…`
      : notes;

  toast.custom(
    () => (
      <div
        aria-live="polite"
        className="flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3 rounded-2xl border border-border/60 bg-popover/80 p-4 shadow-lg backdrop-blur-xl"
        role="status"
      >
        <div className="space-y-1">
          <p className="font-medium text-foreground text-sm">
            cmis {version} is ready
          </p>
          <p className="text-muted-foreground text-xs">
            {preview ??
              "Restart to install it. Your inventory, requests and dispensing history are kept."}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          {/* Neither button dismisses first: both replace this toast with
              whatever comes next, and dismissing here would leave the id
              mid-exit so a following error toast gets swallowed. */}
          <Button
            className="press-feedback"
            onClick={onUseCurrent}
            size="sm"
            variant="ghost"
          >
            Use Current Version
          </Button>
          <Button
            className="press-feedback"
            onClick={onRestart}
            size="sm"
            variant="confirm"
          >
            Restart Now
          </Button>
        </div>
      </div>
    ),
    { duration: Number.POSITIVE_INFINITY, id: UPDATER_TOAST_ID }
  );
}

/**
 * A failure raised *after* the ready card is on screen.
 *
 * The card is closed first and the message raised separately, because the two
 * share a slot and a custom toast cannot be re-rendered as a plain one.
 */
export function showInstallFailedToast(reason: string): void {
  dismissUpdaterToast();
  toast.error("Update not installed", {
    description: reason,
    id: UPDATER_ERROR_TOAST_ID,
  });
}

export function showErrorToast(message: string, description?: string): void {
  toast.error(message, {
    description,
    id: UPDATER_TOAST_ID,
  });
}

export function dismissUpdaterToast(): void {
  toast.dismiss(UPDATER_TOAST_ID);
}
