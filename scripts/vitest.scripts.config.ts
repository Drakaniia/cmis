import { resolve } from "node:path";

/**
 * Standalone config for the maintenance runners in `scripts/`.
 *
 * Kept apart from `apps/desktop/vite.config.ts` so these never join the app's
 * `pnpm test` suite: they write to — and the seed runner **wipes** — a real
 * database on disk, which is exactly what a test run must not do.
 *
 * Deliberately a plain object rather than `defineConfig(...)`: this file sits at
 * the repository root, where the `vite` package is not resolvable (Vite lives in
 * `apps/desktop`), and importing it only for types would break config loading.
 *
 * Both runners are listed here and told apart by a positional filename filter,
 * so they share one config instead of drifting into near-duplicates. The
 * timeout is the larger of the two former values; it is a ceiling, not a
 * behaviour, so the cheaper runner simply never reaches it.
 *
 * Run from `apps/desktop` (so `@/test/project-paths` can find `src-tauri`),
 * via the root `seed:demo` / `import:inventory` scripts.
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
    include: ["scripts/*.test.ts"],
    root: repoRoot,
    testTimeout: 300_000,
  },
};
