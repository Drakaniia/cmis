import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/features/admin/settings/components/settings-page";

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
});
