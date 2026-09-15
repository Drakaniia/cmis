import { resolve } from "node:path";

/**
 * Standalone config for the one-shot maintenance runners in `scripts/`.
 *
 * Kept apart from `apps/desktop/vite.config.ts` so these never join the app's
 * `pnpm test` suite: they write to a real database on disk, which is exactly
 * what a test run must not do.
 *
 * Deliberately a plain object rather than `defineConfig(...)`: this file sits at
 * the repository root, where the `vite` package is not resolvable (Vite lives in
 * `apps/desktop`), and importing it only for types would break config loading.
 *
 * Run from `apps/desktop` (so `@/test/project-paths` can find `src-tauri`):
 *
 *     npx vitest run --config ../../scripts/vitest.import.config.ts
 */
const repoRoot = resolve(import.meta.dirname, "..");

export default {
  resolve: {
    alias: {
      "@": resolve(repoRoot, "apps/desktop/src"),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/import-inventory.test.ts"],
    root: repoRoot,
    testTimeout: 300_000,
  },
};
