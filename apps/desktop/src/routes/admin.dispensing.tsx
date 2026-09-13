import { createFileRoute } from "@tanstack/react-router";
import { DispensingPage } from "@/features/admin/dispensing/components/dispensing-page";
import { validateDispensingSearch } from "@/features/admin/dispensing/dispensing-search";

export const Route = createFileRoute("/admin/dispensing")({
  component: AdminDispensingComponent,
  validateSearch: validateDispensingSearch,
});

function AdminDispensingComponent() {
  return <DispensingPage routePath="/admin/dispensing" />;
}
