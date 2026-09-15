import { toast } from "sonner";
import { UPDATER_TOAST_ID } from "./types";

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

export function showReadyToast(opts: {
  onRestart: () => void;
  onLater: () => void;
}): void {
  toast("Update ready — Restart now / Later", {
    action: {
      label: "Restart now",
      onClick: opts.onRestart,
    },
    cancel: {
      label: "Later",
      onClick: opts.onLater,
    },
    description: "The update has been downloaded. Restart to apply it.",
    duration: Number.POSITIVE_INFINITY,
    id: UPDATER_TOAST_ID,
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
