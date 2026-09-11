import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  // todo: replace with cmis feature - add desktop dashboard / data grid
  // todo: call Rust backend via invoke from @/lib/tauri
  // todo: add TanStack Query for offline SQLite reads
  return <div className="container mx-auto max-w-3xl px-4 py-8">{/* todo: CMIS home */}</div>;
}
