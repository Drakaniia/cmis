import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { motion } from "motion/react";
import { type ChangeEvent, type KeyboardEvent, useCallback } from "react";

import { FIELD_CLASS, shakeVariants } from "../constants";
import { ValidationMessage } from "./validation-message";

export function StepIdentify({
  code,
  foundName,
  isNewItem,
  showErrors,
  reduceMotion,
  onCodeChange,
  onLookup,
  onCreateNew,
}: {
  code: string;
  foundName: string | null;
  isNewItem: boolean;
  showErrors: boolean;
  reduceMotion: boolean;
  onCodeChange: (value: string) => void;
  onLookup: () => void;
  onCreateNew: () => void;
}) {
  const missing = showErrors && code.trim().length === 0;

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onCodeChange(event.target.value),
    [onCodeChange]
  );
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        onLookup();
      }
    },
    [onLookup]
  );

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground text-sm">
        Step 1 — Identify
      </h3>
      <p className="text-caption text-muted-foreground">
        Scan barcode or type SKU. Lookup will prefill next steps.
      </p>
      <label className="block font-medium text-caption text-foreground">
        Barcode / SKU
        <motion.div
          animate={missing && !reduceMotion ? "shake" : "idle"}
          variants={shakeVariants}
        >
          <input
            autoFocus
            className={cn(FIELD_CLASS, missing && "border-destructive")}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Scan barcode or type SKU"
            value={code}
          />
        </motion.div>
        {missing ? (
          <ValidationMessage message="Identifier is required." />
        ) : null}
      </label>
      <div className="flex gap-2">
        <Button className="press-feedback" onClick={onLookup} size="sm">
          Lookup
        </Button>
        {foundName ? (
          <span className="inline-flex items-center rounded-full bg-[var(--success)]/15 px-2.5 py-1 font-medium text-[var(--success)] text-xs">
            Found: {foundName}
          </span>
        ) : null}
        {!foundName && isNewItem && code ? (
          <span className="inline-flex items-center rounded-full bg-[var(--warning)]/15 px-2.5 py-1 font-medium text-[var(--warning)] text-xs">
            New item — will create
          </span>
        ) : null}
      </div>
      {foundName === null && isNewItem && code ? (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-caption">
          Item not found — Create new?
          <Button
            className="ml-2"
            onClick={onCreateNew}
            size="sm"
            variant="outline"
          >
            Create new
          </Button>
        </div>
      ) : null}
    </div>
  );
}
