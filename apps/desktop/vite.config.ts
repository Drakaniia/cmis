/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { previewSql } from "./dev/preview-sql";

export default defineConfig({
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
