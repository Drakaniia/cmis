"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@cmis/ui/components/dialog";
import { useUpdaterOptional } from "@/features/updater/use-updater";

export function AboutModal({
  open,
  onOpenChange,
}: {
  onOpenChange: (v: boolean) => void;
  open: boolean;
}) {
  const updater = useUpdaterOptional();
  const version = updater?.currentVersion ?? "0.1.0";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>About CMIS</DialogTitle>
          <DialogDescription>
            Clinic Management Information System — BukSU Clinic
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="flex items-center gap-3">
            <img
              alt="CMIS"
              className="size-9 rounded-xl dark:hidden"
              height={36}
              src="/cmis-dark-rounded.png"
              width={36}
            />
            <img
              alt="CMIS"
              className="hidden size-9 rounded-xl dark:block"
              height={36}
              src="/cmis-white-rounded.png"
              width={36}
            />
            <div>
              <p className="font-semibold text-[13px] leading-tight">CMIS</p>
              <p className="text-[11.5px] text-muted-foreground">
                Clinical Inventory System
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-[12px]">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-medium font-mono">v{version}</dd>
            <dt className="text-muted-foreground">License</dt>
            <dd>MIT</dd>
            <dt className="text-muted-foreground">Repository</dt>
            <dd>
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="https://github.com/Drakaniia/cmis"
                rel="noopener noreferrer"
                target="_blank"
              >
                github.com/Drakaniia/cmis
              </a>
            </dd>
          </dl>
          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
            Tauri desktop app for inventory, dispensing, and analytics. Built
            with React 19, TanStack Router, and Rust.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
