import {
  DocsCallout,
  DocsKey,
  DocsP,
  DocsRoute,
  DocsSection,
  DocsSubHeading,
} from "../docs-primitives";

const ROLES = [
  {
    description:
      "runs the clinic side of CMIS — records stock in and out, answers requests, dispenses medicines, watches expiry and low-stock lists.",
    label: "Staff",
  },
  {
    description:
      "everything Staff can do, plus user management, thresholds, system settings, data import/export, audit logs and health checks.",
    label: "Admin",
  },
  {
    description:
      "read-only access to dashboards, stock levels, the dispensing log and reports. Viewers cannot change or dispense anything.",
    label: "Viewer",
  },
];

export function WelcomeSection() {
  return (
    <DocsSection id="welcome" title="Welcome to CMIS">
      <DocsP>
        CMIS keeps one record of what is on the shelf, what is about to expire,
        what needs reordering, which requests are still waiting, what has been
        dispensed and how that trends over time. It runs on the clinic computer,
        so every page in this guide works without an internet connection.
      </DocsP>
      <DocsSubHeading>What your role lets you do</DocsSubHeading>
      <ul className="space-y-1.5">
        {ROLES.map((role) => (
          <li
            className="text-[13px] text-muted-foreground leading-relaxed"
            key={role.label}
          >
            <span className="font-medium text-foreground">{role.label}</span> —{" "}
            {role.description}
          </li>
        ))}
      </ul>
      <DocsCallout title="Missing a page or button?">
        Your role decides what you can open, not the app being broken. Ask an
        administrator to check your account if you expected a page to be there.
      </DocsCallout>
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
