import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/features/admin/reports/components/reports-page";

export const Route = createFileRoute("/admin/reports")({
  component: ReportsPage,
});
