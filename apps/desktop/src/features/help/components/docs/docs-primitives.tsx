"use client";

import { Link } from "@tanstack/react-router";
import { ImageIcon } from "lucide-react";

/**
 * Building blocks for the in-app documentation page.
 *
 * Hand-authored React (no markdown pipeline) so the docs inherit the app's
 * design tokens — `surface-frosted`, the muted text scale, dark/light parity —
 * and ship inside the bundle for offline reading.
 */

export function DocsSection({
  children,
  id,
  title,
}: {
  children: React.ReactNode;
  id: string;
  title: string;
}) {
  const headingId = `${id}-heading`;
  return (
    <section aria-labelledby={headingId} className="scroll-mt-6" id={id}>
      <h2
        className="font-semibold text-foreground text-heading tracking-tight"
        id={headingId}
      >
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function DocsP({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] text-muted-foreground leading-relaxed">
      {children}
    </p>
  );
}

export function DocsSubHeading({
  children,
  id,
}: {
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <h3 className="pt-1 font-semibold text-[12.5px] text-foreground" id={id}>
      {children}
    </h3>
  );
}

export function DocsSteps({ children }: { children: React.ReactNode }) {
  return (
    <ol className="list-decimal space-y-2 border-border/60 border-l pl-5 marker:font-medium marker:text-muted-foreground/70 marker:text-xs">
      {children}
    </ol>
  );
}

export function DocsStep({
  children,
  title,
}: {
  children?: React.ReactNode;
  title: string;
}) {
  return (
    <li className="text-[13px] leading-relaxed">
      <span className="font-medium text-foreground">{title}</span>
      {children ? (
        <span className="text-muted-foreground"> {children}</span>
      ) : null}
    </li>
  );
}

const CALLOUT_TONES = {
  note: "border-border/70 bg-muted/40",
  tip: "border-primary/25 bg-primary/[0.06]",
  warning: "border-warning/40 bg-warning/10",
} as const;

export function DocsCallout({
  children,
  title,
  tone = "note",
}: {
  children: React.ReactNode;
  title: string;
  tone?: keyof typeof CALLOUT_TONES;
}) {
  return (
    <div
      className={`rounded-[var(--radius-field)] border px-3 py-2 ${CALLOUT_TONES[tone]}`}
    >
      <p className="font-semibold text-[11.5px] text-foreground">{title}</p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground leading-relaxed">
        {children}
      </p>
    </div>
  );
}

/**
 * Inline reference to where a task happens in the app. Uses the router `Link`
 * (not a raw anchor) so navigation stays client-side — a bare `href` would
 * request `/admin/...` from the bundled asset server, which has no such file.
 */
export function DocsRoute({
  children,
  to,
}: {
  children: React.ReactNode;
  to: string;
}) {
  return (
    <Link
      className="font-medium text-primary underline-offset-2 hover:underline"
      to={to}
    >
      {children}
    </Link>
  );
}

export function DocsKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-medium font-mono text-[11px] text-foreground">
      {children}
    </kbd>
  );
}

export interface DocsScreenshot {
  alt: string;
  caption: string;
  height?: number;
  /** Omitted until the screenshot is captured — renders a neutral placeholder. */
  src?: string;
  width?: number;
}

/**
 * One figure per walkthrough. `width`/`height` are always supplied so the
 * reading column never reflows when an image loads.
 */
export function DocsFigure({
  alt,
  caption,
  height,
  src,
  width,
}: DocsScreenshot) {
  return (
    <figure className="overflow-hidden rounded-[var(--radius-field)] border border-border/70 bg-muted/20">
      {src ? (
        <img
          alt={alt}
          className="h-auto max-w-full"
          height={height}
          loading="lazy"
          src={src}
          width={width}
        />
      ) : (
        <div
          aria-label={alt}
          className="flex h-40 flex-col items-center justify-center gap-1.5 text-muted-foreground/70"
          role="img"
        >
          <ImageIcon aria-hidden className="size-5" />
          <span className="text-[11px]">Screenshot coming soon</span>
        </div>
      )}
      <figcaption className="border-border/70 border-t px-3 py-2 text-[11.5px] text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}
