import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { Check, RotateCcw, Search, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import type { AlertSettings, ExpiryWindowDays } from "../types";
import { SettingsCard } from "./settings-card";

const EXPIRY_WINDOWS: ExpiryWindowDays[] = [30, 60, 90];

export function ThresholdsTab({
  alerts,
  onSetAlerts,
  onSetOverride,
}: {
  alerts: AlertSettings;
  onSetAlerts: (
    patch: Partial<{
      expiryWindowDays: ExpiryWindowDays;
      globalLowStock: number;
    }>
  ) => void;
  onSetOverride: (id: string, value: number | null) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  const query = search.trim().toLowerCase();
  const rows = alerts.overrides.filter((row) =>
    row.itemName.toLowerCase().includes(query)
  );

  function startEdit(id: string, current: number) {
    setEditingId(id);
    setDraft(String(current));
  }

  function commitEdit(id: string) {
    const value = Number(draft);
    if (!Number.isFinite(value) || value < 1) {
      toast.error("Threshold must be a positive number");
      return;
    }
    onSetOverride(id, value);
    setEditingId(null);
  }

  return (
    <div className="space-y-4">
      <SettingsCard
        description="Defaults apply to every item without an explicit override."
        title="Global defaults"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="text-caption text-foreground">
            <legend>Expiry window</legend>
            <div className="mt-1 flex gap-3">
              {EXPIRY_WINDOWS.map((days) => (
                <label className="inline-flex items-center gap-1.5" key={days}>
                  <input
                    checked={alerts.expiryWindowDays === days}
                    className="accent-primary"
                    name="expiry-window"
                    onChange={() => onSetAlerts({ expiryWindowDays: days })}
                    type="radio"
                  />
                  {days} days
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block text-caption text-foreground">
            Low-stock global threshold
            <input
              className="mt-1 h-8 w-28 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              min={1}
              onChange={(event) =>
                onSetAlerts({ globalLowStock: Number(event.target.value) })
              }
              type="number"
              value={alerts.globalLowStock}
            />
            <span className="mt-1 block text-caption text-muted-foreground">
              Items at or below this quantity are flagged.
            </span>
          </label>
        </div>
      </SettingsCard>

      <SettingsCard
        description="Overrides win over the global default until reset."
        title="Per-item thresholds"
      >
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex flex-1 items-center">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2 size-4 text-muted-foreground"
            />
            <input
              aria-label="Search items"
              className="h-8 w-full rounded-md border border-input bg-background pr-8 pl-8 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search items…"
              value={search}
            />
            {search ? (
              <button
                aria-label="Clear search"
                className="absolute right-2 rounded p-1 text-muted-foreground hover:bg-muted"
                onClick={() => setSearch("")}
                type="button"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-border/60">
          <div className="grid grid-cols-[1.6fr_0.8fr_0.8fr_auto] items-center gap-2 border-border/50 border-b bg-muted/60 px-3 py-1.5 font-medium text-caption text-muted-foreground">
            <span>Item</span>
            <span>Global</span>
            <span>Override</span>
            <span className="w-24 text-right">Actions</span>
          </div>
          {rows.map((row) => {
            const overridden = row.override !== null;
            const editing = editingId === row.id;
            return (
              <div
                className="grid grid-cols-[1.6fr_0.8fr_0.8fr_auto] items-center gap-2 border-border/50 border-b px-3 py-2 last:border-b-0"
                key={row.id}
              >
                <span className="truncate text-sm">{row.itemName}</span>
                <span className="text-caption text-muted-foreground">
                  {alerts.globalLowStock}
                </span>
                <span>
                  {editing ? (
                    <input
                      className="h-7 w-16 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                      min={1}
                      onChange={(event) => setDraft(event.target.value)}
                      type="number"
                      value={draft}
                    />
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-caption",
                        overridden
                          ? "border-primary/40 bg-primary/12 text-primary"
                          : "border-border bg-muted text-muted-foreground"
                      )}
                    >
                      {overridden ? row.override : "Global"}
                    </span>
                  )}
                </span>
                <span className="flex justify-end gap-1">
                  {editing ? (
                    <button
                      aria-label={`Save threshold for ${row.itemName}`}
                      className="press-feedback rounded-md p-1 text-primary hover:bg-primary/10"
                      onClick={() => commitEdit(row.id)}
                      type="button"
                    >
                      <Check aria-hidden className="size-3.5" />
                    </button>
                  ) : (
                    <Button
                      className="press-feedback"
                      onClick={() =>
                        startEdit(row.id, row.override ?? alerts.globalLowStock)
                      }
                      size="xs"
                      variant="outline"
                    >
                      Edit
                    </Button>
                  )}
                  {overridden ? (
                    <Button
                      className="press-feedback"
                      onClick={() => {
                        onSetOverride(row.id, null);
                        toast.success(`${row.itemName} reset to global`);
                      }}
                      size="xs"
                      variant="ghost"
                    >
                      <RotateCcw aria-hidden className="size-3" />
                      Reset
                    </Button>
                  ) : null}
                </span>
              </div>
            );
          })}
          {rows.length === 0 ? (
            <p className="px-3 py-4 text-center text-caption text-muted-foreground">
              No items match “{search}”.
            </p>
          ) : null}
        </div>
      </SettingsCard>
    </div>
  );
}
