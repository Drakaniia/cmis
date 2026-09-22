import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/features/admin/components/confirm-modal";
import { isTauriRuntime } from "@/lib/open-external";
import { isFirstRunDatabase } from "../hooks/use-restore";
import { RestoreDialog, type RestoreSource } from "./restore-dialog";

const SKIP_KEY = "cmis-restore-prompt-skipped";

/** Matches both Windows and POSIX separators in an absolute file path. */
const PATH_SEPARATOR = /[/\\]/;

/**
 * First-launch restore prompt (backup-restore spec F11).
 *
 * When the app starts with a genuinely empty database — no inventory, no
 * requests, no dispensing events, no audit rows, so a wipe (which preserves
 * the audit log) never qualifies — the Backup tab's Restore action surfaces
 * as: "Restoring from a backup? Choose a file, or skip." Skipping records
 * itself and never returns.
 */
export function FirstRunRestorePrompt() {
  const [offer, setOffer] = useState(false);
  const [source, setSource] = useState<RestoreSource | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    let cancelled = false;
    try {
      if (window.localStorage.getItem(SKIP_KEY) === "true") {
        return;
      }
    } catch {
      return;
    }
    isFirstRunDatabase()
      .then((first) => {
        if (first && !cancelled) {
          setOffer(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSkip = useCallback(() => {
    try {
      window.localStorage.setItem(SKIP_KEY, "true");
    } catch {
      // private mode: the prompt may return next launch; harmless
    }
    setOffer(false);
  }, []);

  const handleChoose = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const chosen = await open({
        filters: [{ extensions: ["db"], name: "CMIS backup" }],
        multiple: false,
      });
      const path = Array.isArray(chosen) ? chosen[0] : chosen;
      if (!path) {
        return;
      }
      const name = path.split(PATH_SEPARATOR).pop() ?? path;
      setSource({ name, path });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Could not open the file", { description: message });
    }
  }, []);

  const handleCloseSource = useCallback(() => {
    setSource(null);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        handleSkip();
      }
    },
    [handleSkip]
  );

  if (source) {
    return <RestoreDialog onClose={handleCloseSource} source={source} />;
  }
  return (
    <ConfirmModal
      confirmLabel="Choose a backup file…"
      description="Your database is empty. If this device was set up before — or you have a copy on a USB stick — you can restore it now instead of starting over."
      onConfirm={handleChoose}
      onOpenChange={handleOpenChange}
      open={offer}
      title="Restoring from a backup?"
    />
  );
}
