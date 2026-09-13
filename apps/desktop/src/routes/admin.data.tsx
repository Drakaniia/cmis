import { createFileRoute } from "@tanstack/react-router";

import { DataPage } from "@/features/admin/data/components/data-page";

export const Route = createFileRoute("/admin/data")({
  component: DataPage,
});
