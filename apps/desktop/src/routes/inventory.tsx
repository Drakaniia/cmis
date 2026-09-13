import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/inventory")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/inventory" });
  },
});
