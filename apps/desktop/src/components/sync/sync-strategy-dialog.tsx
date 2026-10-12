/**
 * CMIS Cloud Sync — the chooser shown when both this device and the cloud hold
 * records and no strategy is remembered for the endpoint
 * (`docs/cloud-sync-data-guard-spec.md` §6.4).
 *
 * Rendered by the provider, not the settings panel, because an automatic run
 * can hit the overlap while the operator is anywhere in the app. The dialog is
 * presentational: it never moves data itself, it hands the choice back.
 *
 * Props only (no `useSync`), so it can live inside the provider it reads from
 * without a render-order cycle.
 */

import { Button } from "@cmis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@cmis/ui/components/dialog";
import { useCallback } from "react";
import type { SyncStrategy } from "@/lib/sync/strategy";
import type { SyncDecisionState } from "@/lib/sync/use-sync";

export function SyncStrategyDialog({
  decision,
  onChoose,
  onDismiss,
}: {
  decision: SyncDecisionState | null;
  onChoose: (strategy: SyncStrategy) => void;
  onDismiss: () => void;
}) {
  const open = decision !== null;
  const local = decision?.localCounts ?? {};
  const cloud = decision?.cloudCounts ?? {};

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        onDismiss();
      }
    },
    [onDismiss]
  );

  const chooseLocal = useCallback(() => onChoose("local"), [onChoose]);
  const chooseCloud = useCallback(() => onChoose("cloud"), [onChoose]);
  const chooseMerge = useCallback(() => onChoose("merge"), [onChoose]);

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Both this device and the cloud hold records</DialogTitle>
          <DialogDescription>
            Choose which copy is authoritative. Nothing moves until you decide,
            and your choice is remembered for this Worker.
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2">
              <p className="font-medium text-foreground text-xs">
                This device · the cloud
              </p>
              <ul className="mt-1 space-y-0.5">
                {Object.keys({ ...local, ...cloud }).map((table) => (
                  <li
                    className="flex items-center justify-between text-muted-foreground text-xs"
                    key={table}
                  >
                    <span className="font-mono">{table}</span>
                    <span>
                      {local[table as keyof typeof local] ?? 0} here ·{" "}
                      {cloud[table as keyof typeof cloud] ?? 0} in the cloud
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                className="press-feedback justify-start"
                onClick={chooseLocal}
                variant="outline"
              >
                This device&apos;s data
              </Button>
              <Button
                className="press-feedback justify-start"
                onClick={chooseCloud}
                variant="outline"
              >
                Use the cloud copy
              </Button>
              <Button
                className="press-feedback justify-start"
                onClick={chooseMerge}
                variant="outline"
              >
                Merge (newest wins)
              </Button>
            </div>

            <p className="text-muted-foreground text-xs">
              “Use the cloud copy” replaces this device&apos;s records with the
              cloud&apos;s. A backup is written first and can be restored from
              the Status tab.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
