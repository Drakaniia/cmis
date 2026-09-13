import { createFileRoute } from "@tanstack/react-router";

import { HealthPage } from "@/features/admin/health/components/health-page";

export const Route = createFileRoute("/admin/health")({
  component: HealthPage,
});
