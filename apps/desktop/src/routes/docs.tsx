import { createFileRoute } from "@tanstack/react-router";

import { DocsPage } from "@/features/help/components/docs/docs-page";
import { getAppName } from "@/lib/app-name";

export const Route = createFileRoute("/docs")({
  component: DocsPage,
  head: () => ({
    meta: [
      {
        title: `Documentation · ${getAppName()}`,
      },
      {
        content: "Staff guide to inventory, alerts, requests and dispensing.",
        name: "description",
      },
    ],
  }),
});
