"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@cmis/ui/components/dialog";

const SHORTCUTS: { group: string; items: { keys: string; label: string }[] }[] =
  [
    {
      group: "General",
      items: [
        { keys: "Ctrl + ,", label: "Open Settings" },
        { keys: "F1", label: "Documentation" },
        { keys: "Ctrl + B", label: "Toggle Sidebar" },
        { keys: "Ctrl + /", label: "Show Shortcuts" },
        { keys: "Ctrl + K  /  ⌘K", label: "Command Palette" },
      ],
    },
    {
      group: "Navigation",
      items: [
        { keys: "Ctrl + N  /  ⌘N", label: "New Request" },
        { keys: "Ctrl + D  /  ⌘D", label: "Deduct Stock" },
        { keys: "Alt + F / E / V / W / H", label: "Open Menu" },
        { keys: "← →  ↑ ↓", label: "Move Across / Within Menu" },
        { keys: "Enter / Esc", label: "Activate / Close Menu" },
      ],
    },
    {
      group: "Edit",
      items: [
        { keys: "Ctrl + Z", label: "Undo" },
        { keys: "Ctrl + Shift + Z", label: "Redo" },
        { keys: "Ctrl + X / C / V", label: "Cut / Copy / Paste" },
        { keys: "Ctrl + A", label: "Select All" },
      ],
    },
    {
      group: "View",
      items: [
        { keys: "Ctrl +  + / –", label: "Zoom In / Out" },
        { keys: "Ctrl + 0", label: "Actual Size" },
        { keys: "F11", label: "Toggle Full Screen" },
      ],
    },
    {
      group: "Window",
      items: [
        { keys: "Ctrl + M", label: "Minimize" },
        { keys: "Ctrl + W", label: "Close Window" },
        { keys: "Ctrl + Q", label: "Exit App" },
      ],
    },
  ];

export function ShortcutsModal({
  open,
  onOpenChange,
}: {
  onOpenChange: (v: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Accelerators for the menubar and global actions.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[56vh] space-y-4 overflow-y-auto pr-1">
          {SHORTCUTS.map((group) => (
            <div key={group.group}>
              <p className="mb-1.5 font-semibold text-[10.5px] text-muted-foreground/70 uppercase tracking-[0.06em]">
                {group.group}
              </p>
              <div className="space-y-1 rounded-md border bg-muted/20 p-2">
                {group.items.map((it) => (
                  <div
                    className="flex items-center justify-between gap-3 py-1 text-[12px]"
                    key={it.keys + it.label}
                  >
                    <span className="text-muted-foreground">{it.label}</span>
                    <kbd className="rounded bg-muted px-1.5 py-0.5 font-medium font-mono text-[11px] tracking-tight">
                      {it.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
