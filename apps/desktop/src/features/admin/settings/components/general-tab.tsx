import { Button } from "@cmis/ui/components/button";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import type { GeneralSettings } from "../types";
import { SettingsCard } from "./settings-card";

function FormatOption<T extends string>({
  current,
  format,
  name,
  onSelect,
}: {
  current: T;
  format: T;
  name: string;
  onSelect: (format: T) => void;
}) {
  const handleChange = useCallback(() => {
    onSelect(format);
  }, [onSelect, format]);

  return (
    <label className="inline-flex items-center gap-1.5">
      <input
        checked={current === format}
        className="accent-primary"
        name={name}
        onChange={handleChange}
        type="radio"
      />
      {format}
    </label>
  );
}

export function GeneralTab({
  general,
  onChange,
}: {
  general: GeneralSettings;
  onChange: (patch: Partial<GeneralSettings>) => void;
}) {
  const [draft, setDraft] = useState(general);

  useEffect(() => {
    setDraft(general);
  }, [general]);

  const dirty =
    draft.dateFormat !== general.dateFormat ||
    draft.timeFormat !== general.timeFormat;

  const handleDateFormatSelect = useCallback(
    (format: GeneralSettings["dateFormat"]) => {
      setDraft((prev) => ({ ...prev, dateFormat: format }));
    },
    []
  );

  const handleTimeFormatSelect = useCallback(
    (format: GeneralSettings["timeFormat"]) => {
      setDraft((prev) => ({ ...prev, timeFormat: format }));
    },
    []
  );

  const handleSave = useCallback(() => {
    onChange(draft);
    toast.success("Settings saved", {
      description: "General · audited",
    });
  }, [onChange, draft]);

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
                <FormatOption
                  current={draft.dateFormat}
                  format={format}
                  key={format}
                  name="date-format"
                  onSelect={handleDateFormatSelect}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="text-caption text-foreground">
            <legend>Time format</legend>
            <div className="mt-1 flex gap-3">
              {(["12-hour", "24-hour"] as const).map((format) => (
                <FormatOption
                  current={draft.timeFormat}
                  format={format}
                  key={format}
                  name="time-format"
                  onSelect={handleTimeFormatSelect}
                />
              ))}
            </div>
          </fieldset>
        </div>
      </SettingsCard>

      <div className="flex justify-end">
        <Button
          className="press-feedback"
          disabled={!dirty}
          onClick={handleSave}
          size="sm"
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}
