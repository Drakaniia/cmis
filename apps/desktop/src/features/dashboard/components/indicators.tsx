import { cn } from "@cmis/ui/lib/utils";

import type { StatTone } from "../types";

const DOT: Record<StatTone, string> = {
  danger: "bg-[var(--destructive)]",
  neutral: "bg-muted-foreground/40",
  ok: "bg-[var(--success)]",
  warn: "bg-[var(--warning)]",
};

const LABEL: Record<StatTone, string> = {
  danger: "Urgent",
  neutral: "No change",
  ok: "Healthy",
  warn: "Needs attention",
};

/**
 * CMIS-UI-00 §5.3 — 8px status dot. Colour is never the only signal: the dot
 * always ships a text label for assistive tech.
 */
export function StatusDot({ label, tone }: { label?: string; tone: StatTone }) {
  const text = label ?? LABEL[tone];
  return (
    <span
      aria-label={text}
      className="inline-flex items-center"
      role="img"
      title={text}
    >
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", DOT[tone])}
      />
    </span>
  );
}

/**
 * 7-day trend. Rendered only in comfortable density (§3.1) and stretched to the
 * card width, so `vector-effect` keeps the stroke hairline-sharp when scaled.
 */
export function Sparkline({
  data,
  className,
}: {
  className?: string;
  data: number[];
}) {
  if (data.length < 2) {
    return null;
  }
  const width = 100;
  const height = 28;
  const inset = 3;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const line = data
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * (height - inset * 2) - inset;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden
      className={cn("w-full text-primary", className)}
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
    >
      <polyline
        fill="none"
        points={line}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
