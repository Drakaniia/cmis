import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/features/admin/components/confirm-modal";
import { absoluteDateTime } from "@/features/admin/format";
import {
  type BackupInspection,
  inspectionMessage,
} from "../data/backup-inspection";
import { applyRestore, inspectBackup } from "../hooks/use-restore";

export interface RestoreSource {
  name: string;
  path: string;
}

type Phase = "checking" | "error" | "ready" | "refused" | "working";

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

function confirmLabelFor(phase: Phase): string {
  if (phase === "ready") {
    return "Restore and restart";
  }
  if (phase === "working") {
    return "Restoring…";
  }
  if (phase === "checking") {
    return "Checking…";
  }
  return "Understood";
}

/**
 * The verified restore flow (backup-restore spec F10).
 *
 * Inspect first, refuse-or-confirm, then swap and restart immediately. A
 * refusal names the failed check and touches nothing; the swap never runs on
 * a file that failed inspection.
 */
export function RestoreDialog({
  onClose,
  source,
}: {
  onClose: () => void;
  source: RestoreSource | null;
}) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [inspection, setInspection] = useState<BackupInspection | null>(null);
  const [error, setError] = useState("");
  const runId = useRef(0);

  useEffect(() => {
    if (!source) {
      return;
    }
    runId.current += 1;
    const id = runId.current;
    setPhase("checking");
    setInspection(null);
    setError("");
    inspectBackup(source.path)
      .then((result) => {
        if (runId.current !== id) {
          return;
        }
        setInspection(result);
        setPhase(result.ok ? "ready" : "refused");
      })
      .catch((cause: unknown) => {
        if (runId.current !== id) {
          return;
        }
        setError(cause instanceof Error ? cause.message : String(cause));
        setPhase("error");
      });
  }, [source]);

  const handleApply = useCallback(async () => {
    if (phase !== "ready" || !source) {
      return;
    }
    setPhase("working");
    try {
      await applyRestore(source.path);
    } catch (cause) {
      // `applyRestore` relaunches on success, so landing here means the swap
      // did NOT happen: report the real reason and stay put (spec F10.5).
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message.includes("Restarting with the restored database")) {
        return;
      }
      setError(message);
      setPhase("error");
      toast.error("Restore failed", { description: message });
    }
  }, [phase, source]);

  const handleConfirm = useCallback(() => {
    if (phase === "ready") {
      handleApply().catch(() => undefined);
    } else if (phase === "refused" || phase === "error") {
      onClose();
    }
  }, [handleApply, onClose, phase]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && phase !== "working") {
        onClose();
      }
    },
    [onClose, phase]
  );

  if (!source) {
    return null;
  }

  const detail =
    inspection && inspection.mtime > 0
      ? `${source.name} · ${absoluteDateTime(new Date(inspection.mtime * 1000).toISOString())} · ${formatBytes(inspection.size)}`
      : source.name;

  return (
    <ConfirmModal
      confirmLabel={confirmLabelFor(phase)}
      description={
        <RestoreDescription
          detail={detail}
          error={error}
          inspection={inspection}
          phase={phase}
        />
      }
      destructive={phase === "ready"}
      onConfirm={handleConfirm}
      onOpenChange={handleOpenChange}
      open
      title="Restore from backup?"
      typeToConfirm={phase === "ready" ? "RESTORE" : undefined}
    />
  );
}

function RestoreDescription({
  detail,
  error,
  inspection,
  phase,
}: {
  detail: string;
  error: string;
  inspection: BackupInspection | null;
  phase: Phase;
}) {
  if (phase === "checking") {
    return <span>Checking {detail}…</span>;
  }
  if (phase === "refused") {
    return (
      <span className="space-y-2">
        <span className="block font-medium text-foreground">
          {inspection
            ? inspectionMessage(inspection.code) || inspection.reason
            : "This file cannot be restored."}
        </span>
        <span className="block">
          The current database was not touched. Pick a different file or make a
          fresh backup first.
        </span>
      </span>
    );
  }
  if (phase === "error") {
    return (
      <span className="space-y-2">
        <span className="block font-medium text-foreground">
          The restore did not happen.
        </span>
        <span className="block">{error}</span>
        <span className="block">
          The current database was not touched. Close other CMIS windows and try
          again.
        </span>
      </span>
    );
  }
  return (
    <span className="space-y-2">
      <span className="block font-medium text-foreground">{detail}</span>
      <span className="block">
        Restoring replaces the current database entirely, and any change
        recorded since this copy will be lost.
      </span>
    </span>
  );
}
