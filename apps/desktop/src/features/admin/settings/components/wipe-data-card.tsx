import { Button } from "@cmis/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cmis/ui/components/card";
import { Checkbox } from "@cmis/ui/components/checkbox";
import { ShieldAlert } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/features/admin/components/confirm-modal";
import { wipeAllData } from "@/lib/db";

export function WipeDataCard({
  onWipe = wipeAllData,
}: {
  onWipe?: typeof wipeAllData;
}) {
  const [open, setOpen] = useState(false);
  const [alsoReset, setAlsoReset] = useState(true);

  const handleConfirm = useCallback(async () => {
    try {
      await onWipe({ resetSettings: alsoReset });
      toast.success("All data wiped");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wipe failed");
    }
  }, [alsoReset, onWipe]);

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
            Permanently delete all inventory, dispensing, and queue data. This
            cannot be undone.
          </CardDescription>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: custom Checkbox is inside label */}
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
        confirmLabel="Wipe data"
        description="This will permanently delete all inventory items, dispensing history, and queued requests. Type WIPE to confirm."
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
