import {
  DocsKey,
  DocsP,
  DocsRoute,
  DocsSection,
  DocsSubHeading,
} from "../docs-primitives";

export function WelcomeSection() {
  return (
    <DocsSection id="welcome" title="Welcome to CMIS">
      <DocsP>
        CMIS keeps one record of what is on the shelf, what is about to expire,
        what needs reordering, which requests are still waiting, what has been
        dispensed and how that trends over time. It runs on the clinic computer,
        so every page in this guide works without an internet connection.
      </DocsP>
      <DocsSubHeading>Three ways to get somewhere</DocsSubHeading>
      <ul className="space-y-1.5">
        <li className="text-[13px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">The sidebar</span> —
          grouped by Overview, Inventory, Requests and Reports. Collapse it with{" "}
          <DocsKey>Ctrl</DocsKey> <DocsKey>B</DocsKey> when you want more room.
        </li>
        <li className="text-[13px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">The search box</span> —
          press <DocsKey>Ctrl</DocsKey> <DocsKey>K</DocsKey> and type a page
          name, then <DocsKey>Enter</DocsKey>.
        </li>
        <li className="text-[13px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">This guide</span> —
          press <DocsKey>F1</DocsKey> from anywhere in the app, or use the{" "}
          <span className="font-medium text-foreground">?</span> button at the
          top right.
        </li>
      </ul>
      <DocsP>
        Start with <DocsRoute to="/admin/inventory">Stock Management</DocsRoute>{" "}
        if you are receiving deliveries, or{" "}
        <DocsRoute to="/admin/requests">Request Queue</DocsRoute> if you are
        answering what staff have asked for.
      </DocsP>
    </DocsSection>
  );
}
