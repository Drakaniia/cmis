"use client";

import {
  DOCS_TOC_ITEMS,
  DocsTocChips,
  DocsTocRail,
  useActiveSection,
} from "./docs-toc";
import { AnalyticsSection } from "./sections/analytics";
import { DispensingSection } from "./sections/dispensing";
import { ExpirySection } from "./sections/expiry";
import { LowStockSection } from "./sections/low-stock";
import { StockReportSection } from "./sections/reports";
import { RequestsSection } from "./sections/requests";
import { StillStuckSection } from "./sections/still-stuck";
import { StockSection } from "./sections/stock";
import { WelcomeSection } from "./sections/welcome";

/** Module-scope so the scroll-spy effect keeps a stable dependency. */
const TOC_IDS = DOCS_TOC_ITEMS.map((item) => item.id);

/**
 * `/docs` — the staff handbook, shipped with the app.
 *
 * One long reading column (`max-w-3xl`) with a sticky TOC rail on wide screens
 * and anchor chips on narrow ones. Content is hand-authored React so it inherits
 * the app's design tokens and needs no network to render.
 *
 * The page's only `h1` lives in `DocsHeader`; sections start at `h2`.
 */
export function DocsPage() {
  const activeId = useActiveSection(TOC_IDS);

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-8 px-4 py-6 sm:px-6">
      <DocsTocRail activeId={activeId} items={DOCS_TOC_ITEMS} />
      <article className="min-w-0 max-w-3xl flex-1">
        <DocsTocChips activeId={activeId} items={DOCS_TOC_ITEMS} />
        <p className="mb-8 text-[13px] text-muted-foreground leading-relaxed">
          A practical guide to the clinic system: what each page is for, the
          order to do things in, and what to do when something looks wrong.
          Every section is short — read the one you need.
        </p>
        <div className="space-y-10">
          <WelcomeSection />
          <StockSection />
          <ExpirySection />
          <LowStockSection />
          <RequestsSection />
          <DispensingSection />
          <StockReportSection />
          <AnalyticsSection />
          <StillStuckSection />
        </div>
      </article>
    </div>
  );
}
