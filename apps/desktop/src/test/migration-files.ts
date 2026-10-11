import { readdirSync } from "node:fs";

import { MIGRATIONS_DIR } from "./project-paths";

/**
 * The migration files, in the order the SQL plugin applies them.
 *
 * Split into its own module so the sync test helper (`sync-database.ts`) and the
 * migration tests share one definition — the ordering rule ("sorted by name") is
 * a property of how `lib.rs` registers them, and two copies of it could disagree.
 */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}
