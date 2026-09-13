import { createFileRoute } from "@tanstack/react-router";

import { AuditPage } from "@/features/admin/audit/components/audit-page";

export const Route = createFileRoute("/admin/audit")({
  component: AuditPage,
});
