import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Test-only path resolution.
 *
 * `import.meta.url` is rewritten by the jsdom test environment, so tests that
 * touch real files (migrations, the converted workbook) resolve them from disk
 * instead: walk up from the working directory until the Tauri crate appears,
 * which pins `apps/desktop` regardless of which package script started vitest.
 */
function findPackageRoot(start: string): string {
  let dir = start;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(dir, "src-tauri"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(
    `Could not locate apps/desktop (no src-tauri directory above ${start})`
  );
}

/** `apps/desktop` */
export const PACKAGE_ROOT = findPackageRoot(process.cwd());

/** Repository root — two levels above the desktop package. */
export const REPO_ROOT = resolve(PACKAGE_ROOT, "../..");

/** `apps/desktop/src-tauri/migrations` — the SQL the plugin runs at startup. */
export const MIGRATIONS_DIR = join(PACKAGE_ROOT, "src-tauri", "migrations");

/** `apps/desktop/src-tauri/src/lib.rs` — where migrations are registered. */
export const TAURI_LIB_RS = join(PACKAGE_ROOT, "src-tauri", "src", "lib.rs");
