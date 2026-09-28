import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { ScanLine } from "lucide-react";
import { motion } from "motion/react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useRef,
} from "react";

import { FIELD_CLASS, shakeVariants } from "../constants";
import { ValidationMessage } from "./validation-message";

export function StepIdentify({
  code,
  foundName,
  isNewItem,
  showErrors,
  reduceMotion,
  placeholder,
  hasResolvedItem = false,
  onCodeChange,
  onLookup,
  onCreateNew,
  onScanButtonClick,
}: {
  code: string;
  foundName: string | null;
  isNewItem: boolean;
  showErrors: boolean;
  reduceMotion: boolean;
  placeholder?: string;
  hasResolvedItem?: boolean;
  onCodeChange: (value: string) => void;
  onLookup: () => void;
  onCreateNew: () => void;
  onScanButtonClick?: () => void;
}) {
  const missing = showErrors && code.trim().length === 0 && !hasResolvedItem;
  const inputRef = useRef<HTMLInputElement>(null);

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
  const handleScanButtonClick = useCallback(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    onScanButtonClick?.();
  }, [onScanButtonClick]);

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
          <div className="relative">
            <input
              autoFocus
              className={cn(
                FIELD_CLASS,
                "pr-10",
                missing && "border-destructive"
              )}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder ?? "Scan barcode or type SKU"}
              ref={inputRef}
              value={code}
            />
            <button
              aria-label="Focus barcode input for scanner"
              className="press-feedback absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={handleScanButtonClick}
              title="Focus barcode input for scanner"
              type="button"
            >
              <ScanLine aria-hidden className="size-4" />
            </button>
          </div>
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
