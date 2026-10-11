import { resolve } from "node:path";

/**
 * Test configuration for the sync Worker.
 *
 * A plain object rather than `defineConfig(...)`: `workers/sync` is deliberately
 * not a pnpm workspace member (it has no runtime dependencies — `wrangler`
 * bundles it), so `vite` is not resolvable from here and importing it only for
 * types would break config loading. The app's vitest binary runs it:
 *
 *     pnpm test:worker
 *
 * `environment: "node"` because these tests are about SQL and HTTP: they open
 * real `node:sqlite` databases, apply the app's own migration files and drive the
 * Worker's `handleRequest` with real `Request` objects.
 */
const root = resolve(import.meta.dirname);

export default {
  root,
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
  },
};
