import { resolve } from "node:path";

/**
 * Standalone config for the demo-data seed runner in `scripts/`.
 *
 * Kept apart from `apps/desktop/vite.config.ts` so it never joins the app's
 * `pnpm test` suite: the runner **wipes and rewrites** a real database on disk,
 * which is exactly what a test run must not do.
 *
 * Deliberately a plain object rather than `defineConfig(...)`: this file sits at
 * the repository root, where the `vite` package is not resolvable (Vite lives in
 * `apps/desktop`), and importing it only for types would break config loading.
 *
 * Run from `apps/desktop` (so `@/test/project-paths` can find `src-tauri`):
 *
 *     npx vitest run --config ../../scripts/vitest.seed.config.ts
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
    include: ["scripts/seed-demo-data.test.ts"],
    root: repoRoot,
    testTimeout: 120_000,
  },
};
