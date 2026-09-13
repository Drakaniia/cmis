import { createFileRoute } from "@tanstack/react-router";

import { UsersPage } from "@/features/admin/users/components/users-page";

export const Route = createFileRoute("/admin/users")({
  component: UsersPage,
});
