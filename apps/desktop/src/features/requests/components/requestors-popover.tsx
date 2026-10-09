import {
  Popover,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverTrigger,
} from "@cmis/ui/components/popover";
import { cn } from "@cmis/ui/lib/utils";
import { Check, ChevronDown, Search, Users } from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";

import type { RequestorDirectory, RequestorSummary } from "../requestors";

/** One requestor row. Its own component so the click handler stays stable. */
function RequestorRow({
  active,
  entry,
  onSelect,
}: {
  active: boolean;
  entry: RequestorSummary;
  onSelect: (entry: RequestorSummary) => void;
}) {
  const handleClick = useCallback(() => onSelect(entry), [entry, onSelect]);

  return (
    <li>
      <button
        aria-pressed={active}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent",
          active && "bg-accent/60"
        )}
        onClick={handleClick}
        type="button"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium text-[13px] text-foreground">
              {entry.name}
            </span>
            {entry.id ? (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {entry.id}
              </span>
            ) : null}
          </span>
          {entry.email ? (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {entry.email}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {entry.count} {entry.count === 1 ? "request" : "requests"}
        </span>
        {active ? (
          <Check aria-hidden className="size-3.5 shrink-0 text-primary" />
        ) : null}
      </button>
    </li>
  );
}

/**
 * CMIS-UI-05 — the complete requestor list, browsable from the filter bar.
 *
 * The directory is a projection over the loaded queue (see `requestors.ts`), so
 * this popover only presents: a search field for long lists, one row per
 * requestor with their ID, email and request count, and a click that applies the
 * board's existing requestor filter. Anonymous walk-ins are summarised in the
 * footer rather than listed — they have no details to isolate.
 */
export function RequestorsPopover({
  className,
  directory,
  onSelect,
  selected,
}: {
  className?: string;
  directory: RequestorDirectory;
  /** Applies the board's requestor filter to the picked requestor. */
  onSelect: (filterValue: string) => void;
  /** The filter currently applied, so the active requestor is marked. */
  selected?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
    }
  }, []);

  const handleSelect = useCallback(
    (entry: RequestorSummary) => {
      onSelect(entry.filterValue);
      setOpen(false);
      setQuery("");
    },
    [onSelect]
  );

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
    []
  );

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (needle === "") {
      return directory.requestors;
    }
    return directory.requestors.filter((entry) =>
      `${entry.name} ${entry.id} ${entry.email}`.toLowerCase().includes(needle)
    );
  }, [directory.requestors, needle]);

  const total = directory.requestors.length;
  const single = total === 1;

  let body: ReactNode;
  if (total === 0) {
    body = (
      <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
        No requestors yet.
        <span className="mt-1 block text-[11px]">
          Requests with a name, ID or email will appear here.
        </span>
      </p>
    );
  } else if (filtered.length === 0) {
    body = (
      <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
        No requestors match “{query.trim()}”.
      </p>
    );
  } else {
    body = (
      <ul className="scrollbar-subtle max-h-[320px] overflow-y-auto p-1">
        {filtered.map((entry) => (
          <RequestorRow
            active={entry.filterValue === selected}
            entry={entry}
            key={entry.key}
            onSelect={handleSelect}
          />
        ))}
      </ul>
    );
  }

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger
        aria-label={`Requestors — ${total} ${single ? "requestor" : "requestors"}. Press to browse the complete list.`}
        className={cn(
          "press-feedback inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3.5 font-medium text-[12px] tracking-[0.01em] shadow-sm hover:bg-accent hover:text-accent-foreground",
          className
        )}
        type="button"
      >
        <Users aria-hidden className="size-3.5 text-muted-foreground" />
        Requestors
        {total > 0 ? (
          <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
            {total}
          </span>
        ) : null}
        <ChevronDown
          aria-hidden
          className={cn(
            "size-3 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </PopoverTrigger>

      <PopoverPortal>
        <PopoverPositioner align="start" sideOffset={6}>
          <PopoverPopup className="surface-frosted w-[320px] overflow-hidden border-border/40 p-0 shadow-xl">
            <div className="border-border/40 border-b p-2">
              <div className="relative flex items-center">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground/70"
                />
                <input
                  aria-label="Search requestors"
                  className="h-8 w-full rounded-full border border-border/60 bg-muted/50 pr-3 pl-8 text-[12px] tracking-[0.01em] outline-none placeholder:text-muted-foreground/60 focus:border-ring/60 focus:bg-card focus:ring-2 focus:ring-ring/20"
                  onChange={handleQueryChange}
                  placeholder="Search name, ID or email…"
                  value={query}
                />
              </div>
            </div>

            {body}

            {directory.anonymousCount > 0 ? (
              <p className="border-border/30 border-t bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                {directory.anonymousCount} walk-in request
                {directory.anonymousCount === 1 ? "" : "s"} — no requestor
                details recorded.
              </p>
            ) : null}
          </PopoverPopup>
        </PopoverPositioner>
      </PopoverPortal>
    </Popover>
  );
}
