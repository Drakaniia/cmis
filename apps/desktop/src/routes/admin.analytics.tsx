import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsPage } from "@/features/admin/analytics/components/analytics-page";

export const Route = createFileRoute("/admin/analytics")({
  component: AnalyticsPage,
});
