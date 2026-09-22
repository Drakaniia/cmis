import { Button } from "@cmis/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cmis/ui/components/card";
import { Checkbox } from "@cmis/ui/components/checkbox";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/features/admin/components/confirm-modal";
import { useBackupActions } from "@/features/backup/hooks/use-daily-backup";
import { wipeAllData } from "@/lib/db";
import { isTauriRuntime } from "@/lib/open-external";

export function WipeDataCard({
  onWipe = wipeAllData,
}: {
  onWipe?: typeof wipeAllData;
}) {
  const queryClient = useQueryClient();
  const { runManualBackup } = useBackupActions();
  const [open, setOpen] = useState(false);
  const [alsoReset, setAlsoReset] = useState(true);
  const [wiping, setWiping] = useState(false);

  const handleConfirm = useCallback(async () => {
    setWiping(true);
    try {
      // A wipe is the one irreversible action that earns a safety copy first
      // (backup-restore spec F7): a `cmis-manual-*` file, never pruned. If the
      // copy fails, the wipe does NOT proceed — destroying data that has just
      // been proven unrecoverable is worse than refusing the action. Outside
      // Tauri (browser preview, tests) there is no filesystem, so the layer
      // is inert and the wipe proceeds as before.
      if (isTauriRuntime()) {
        try {
          await runManualBackup();
        } catch (error) {
          toast.error("Wipe stopped — the safety backup failed", {
            description: error instanceof Error ? error.message : String(error),
          });
          return;
        }
      }
      await onWipe({ resetSettings: alsoReset });
      // The wipe empties every table at once, so no cached query can still
      // describe the app — refetching only the inventory keys would leave the
      // dashboard, requests and Trash showing rows that no longer exist.
      await queryClient.invalidateQueries();
      toast.success("All data wiped");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wipe failed");
    } finally {
      setWiping(false);
    }
  }, [alsoReset, onWipe, queryClient, runManualBackup]);

  const handleCheckedChange = useCallback(
    (v: boolean | "indeterminate") => setAlsoReset(Boolean(v)),
    []
  );
  const handleOpen = useCallback(() => setOpen(true), []);

  return (
    <>
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader className="flex-row items-center gap-2">
          <ShieldAlert aria-hidden className="size-4 text-destructive" />
          <CardTitle className="text-sm">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CardDescription>
            Permanently delete all inventory, dispensing, and queue data. A
            safety backup is written first; if that backup fails, the wipe does
            not run. This cannot be undone.
          </CardDescription>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={alsoReset}
              onCheckedChange={handleCheckedChange}
            />
            Also reset suppliers, categories, and settings
          </label>
          <Button
            className="press-feedback"
            onClick={handleOpen}
            variant="destructive"
          >
            Wipe All Data
          </Button>
        </CardContent>
      </Card>
      <ConfirmModal
        confirmLabel={wiping ? "Working…" : "Wipe data"}
        description="A safety backup is written first. This will permanently delete all inventory items, dispensing history, and queued requests. Type WIPE to confirm."
        destructive
        onConfirm={handleConfirm}
        onOpenChange={setOpen}
        open={open}
        title="Wipe all data?"
        typeToConfirm="WIPE"
      />
    </>
  );
}
