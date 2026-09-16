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
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    passWithNoTests: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
