import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { ScanLine, X } from "lucide-react";
import * as React from "react";

export function BarcodeInput({
  value,
  onChange,
  onScan,
  placeholder = "Scan barcode or type SKU",
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onScan: (code: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const code = (e.target as HTMLInputElement).value.trim();
      if (code) {
        onScan(code);
      }
    }
  }

  if (!expanded) {
    return (
      <Button
        aria-label="Scan barcode — expand input"
        className="press-feedback shrink-0"
        onClick={() => setExpanded(true)}
        size="icon-sm"
        title="Scan barcode or type SKU"
        variant="ghost"
      >
        <ScanLine className="size-4" />
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 shadow-sm",
        "fade-in slide-in-from-right-1 animate-in duration-150"
      )}
    >
      <ScanLine aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <input
        aria-label="Barcode or SKU"
        autoFocus={autoFocus}
        className="h-7 w-[200px] bg-transparent text-sm outline-none placeholder:text-muted-foreground sm:w-[240px]"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        ref={inputRef}
        value={value}
      />
      <Button
        aria-label="Collapse barcode input"
        className="press-feedback h-6 w-6"
        onClick={() => setExpanded(false)}
        size="icon-sm"
        variant="ghost"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
