import { cn } from "@cmis/ui/lib/utils";

export type HealthStatus = "ok" | "warn" | "danger" | "neutral";

const DOT_CLASS: Record<HealthStatus, string> = {
  danger: "bg-destructive",
  neutral: "bg-muted-foreground/40",
  ok: "bg-[var(--success)]",
  warn: "bg-[var(--warning)]",
};

/**
 * CMIS-UI-09 §5.3 — 8px status dot. Color is never the only signal: the
 * caller passes a text label rendered for assistive tech (00 §5.3).
 */
export function StatusDot({
  status,
  label,
  pulse = false,
}: {
  label: string;
  pulse?: boolean;
  status: HealthStatus;
}) {
  return (
    <span
      aria-label={label}
      className="inline-flex items-center"
      role="img"
      title={label}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          DOT_CLASS[status],
          pulse && "motion-safe:animate-pulse"
        )}
      />
    </span>
  );
}

/**
 * CMIS-UI-09 §5.3 — 24px sparkline: `muted` stroke with a `chart-1` area fill
 * at 0.12 opacity. Trends are decorative, so the value label carries meaning.
 */
export function Sparkline({
  data,
  className,
  height = 24,
  width = 96,
}: {
  className?: string;
  data: number[];
  height?: number;
  width?: number;
}) {
  if (data.length === 0) {
    return null;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const inset = 2;
  const step = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / range) * (height - inset * 2) - inset;
    return { x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;

  return (
    <svg
      aria-hidden
      className={cn("overflow-visible text-muted-foreground/60", className)}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <polygon
        fill="var(--chart-1)"
        opacity={0.12}
        points={area}
        stroke="none"
      />
      <polyline
        fill="none"
        points={line}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
    </svg>
  );
}

/**
 * CMIS-UI-09 §1.5 — "X actions last 7 days" mini histogram for the user detail
 * sheet, matching the Reports spark language (00 §5: no ad-hoc chart styles).
 */
const HISTOGRAM_SLOTS = ["d-6", "d-5", "d-4", "d-3", "d-2", "d-1", "d-0"];

export function MiniHistogram({
  data,
  label,
}: {
  data: number[];
  label: string;
}) {
  const max = Math.max(...data, 1);
  const bars = data.map((value, index) => ({
    id: HISTOGRAM_SLOTS[index] ?? `slot-${index}`,
    value,
  }));
  return (
    <div aria-label={label} className="flex h-10 items-end gap-1" role="img">
      {bars.map((bar) => (
        <span
          aria-hidden
          className="flex-1 rounded-sm bg-primary/70"
          key={bar.id}
          style={{ height: `${(bar.value / max) * 100}%` }}
        />
      ))}
    </div>
  );
}
