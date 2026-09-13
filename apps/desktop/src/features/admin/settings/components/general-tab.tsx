import { Button } from "@cmis/ui/components/button";
import * as React from "react";
import { toast } from "sonner";

import type { GeneralSettings } from "../types";
import { SettingsCard } from "./settings-card";

export function GeneralTab({
  general,
  onChange,
}: {
  general: GeneralSettings;
  onChange: (patch: Partial<GeneralSettings>) => void;
}) {
  const [draft, setDraft] = React.useState(general);

  React.useEffect(() => {
    setDraft(general);
  }, [general]);

  const dirty =
    draft.dateFormat !== general.dateFormat ||
    draft.timeFormat !== general.timeFormat;

  return (
    <div className="space-y-4">
      <SettingsCard
        description="App identity comes from the Tauri bundle and is read-only at runtime."
        title="Application"
      >
        <label className="block text-caption text-foreground">
          App name
          <input
            className="mt-1 h-8 w-full max-w-sm rounded-md border border-input bg-muted/40 px-3 text-muted-foreground text-sm outline-none"
            readOnly
            value={draft.appName}
          />
        </label>
      </SettingsCard>

      <SettingsCard
        description="Applies to every role the moment it is saved."
        title="Defaults"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="text-caption text-foreground">
            <legend>Date format</legend>
            <div className="mt-1 flex gap-3">
              {(["MM/DD/YYYY", "DD/MM/YYYY"] as const).map((format) => (
                <label
                  className="inline-flex items-center gap-1.5"
                  key={format}
                >
                  <input
                    checked={draft.dateFormat === format}
                    className="accent-primary"
                    name="date-format"
                    onChange={() =>
                      setDraft((prev) => ({ ...prev, dateFormat: format }))
                    }
                    type="radio"
                  />
                  {format}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="text-caption text-foreground">
            <legend>Time format</legend>
            <div className="mt-1 flex gap-3">
              {(["12-hour", "24-hour"] as const).map((format) => (
                <label
                  className="inline-flex items-center gap-1.5"
                  key={format}
                >
                  <input
                    checked={draft.timeFormat === format}
                    className="accent-primary"
                    name="time-format"
                    onChange={() =>
                      setDraft((prev) => ({ ...prev, timeFormat: format }))
                    }
                    type="radio"
                  />
                  {format}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </SettingsCard>

      <div className="flex justify-end">
        <Button
          className="press-feedback"
          disabled={!dirty}
          onClick={() => {
            onChange(draft);
            toast.success("Settings saved", {
              description: "General · audited",
            });
          }}
          size="sm"
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}
