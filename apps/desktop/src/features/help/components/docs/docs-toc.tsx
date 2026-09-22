"use client";

import { useEffect, useState } from "react";

export interface DocsTocItem {
  id: string;
  title: string;
}

export const DOCS_TOC_ITEMS: DocsTocItem[] = [
  { id: "welcome", title: "Welcome" },
  { id: "stock-management", title: "Stock Management" },
  { id: "expiry-alerts", title: "Expiry Alerts" },
  { id: "low-stock-alerts", title: "Low-Stock Alerts" },
  { id: "request-queue", title: "Request Queue" },
  { id: "dispensing-log", title: "Dispensing Log" },
  { id: "stock-report", title: "Stock Report" },
  { id: "analytics", title: "Analytics" },
  { id: "still-stuck", title: "Still stuck?" },
];

/**
 * Scroll-spy for the TOC.
 *
 * The page scrolls inside `main`, so the observer watches the sections
 * themselves with a narrow band (rootMargin) around the upper third of the
 * viewport — whichever section crosses that band owns the highlight.
 */
export function useActiveSection(ids: readonly string[]): string {
  const [activeId, setActiveId] = useState<string>(ids[0] ?? "");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const [first] = visible;
        if (first) {
          setActiveId(first.target.id);
        }
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );

    for (const element of elements) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [ids]);

  return activeId;
}

function TocLink({ active, item }: { active: boolean; item: DocsTocItem }) {
  return (
    <a
      aria-current={active ? "location" : undefined}
      className={
        active
          ? "block border-primary border-l-2 py-1 pl-3 font-medium text-[12px] text-primary"
          : "block border-transparent border-l-2 py-1 pl-3 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      }
      href={`#${item.id}`}
    >
      {item.title}
    </a>
  );
}

/** Sticky rail for wide screens. */
export function DocsTocRail({
  activeId,
  items,
}: {
  activeId: string;
  items: DocsTocItem[];
}) {
  return (
    <nav aria-label="On this page" className="hidden w-52 shrink-0 lg:block">
      <div className="sticky top-4">
        <p className="mb-2 font-semibold text-[10.5px] text-muted-foreground/70 uppercase tracking-[0.06em]">
          On this page
        </p>
        <div className="space-y-0.5">
          {items.map((item) => (
            <TocLink active={activeId === item.id} item={item} key={item.id} />
          ))}
        </div>
      </div>
    </nav>
  );
}

/** Horizontal anchor chips for narrow screens. */
export function DocsTocChips({
  activeId,
  items,
}: {
  activeId: string;
  items: DocsTocItem[];
}) {
  return (
    <nav
      aria-label="On this page"
      className="scrollbar-subtle sticky top-0 z-10 -mx-4 mb-1 flex gap-1.5 overflow-x-auto border-border/60 border-b bg-background/85 px-4 py-2 backdrop-blur lg:hidden"
    >
      {items.map((item) => (
        <a
          aria-current={activeId === item.id ? "location" : undefined}
          className={
            activeId === item.id
              ? "shrink-0 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-[11.5px] text-primary"
              : "shrink-0 rounded-full border border-border/70 px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
          }
          href={`#${item.id}`}
          key={item.id}
        >
          {item.title}
        </a>
      ))}
    </nav>
  );
}
