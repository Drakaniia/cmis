/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { previewSql } from "./dev/preview-sql";

export default defineConfig({
  // Cloud sync reads its configuration from the build environment with the
  // spec's names (`docs/cloud-sync-spec.md` §1): `SYNC_API_ENDPOINT`,
  // `SYNC_INTERVAL_MS`, `SYNC_OFFLINE_QUEUE_MAX_SIZE`, `SYNC_TOKEN`. Vite only
  // exposes `VITE_`-prefixed variables by default, so the prefix is widened here
  // and nothing else — `lib/sync/sync-settings.ts` decides which of the exposed
  // names it actually reads.
  envPrefix: ["VITE_", "SYNC_"],
  plugins: [
    tailwindcss(),
    tanstackRouter({
      autoCodeSplitting: true,
      target: "react",
    }),
    react(),
    // Gives the browser preview a real SQLite database, so the data flows are
    // walkable outside Tauri. `apply: "serve"` keeps it out of release builds.
    previewSql(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 3001,
  },
  test: {
    environment: "jsdom",
    exclude: ["node_modules", "dist", ".tanstack"],
    globals: true,
    // Any test that opens a Base UI popup spends 15-30s in React's act flush
    // under jsdom (the component work itself is sub-second), so the 5s default
    // reports timeouts on popup tests that are in fact passing. The same cost
    // lands in the unmount hook, hence the matching hookTimeout.
    hookTimeout: 30_000,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    passWithNoTests: true,
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 30_000,
  },
});
