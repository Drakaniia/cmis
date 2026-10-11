#!/usr/bin/env node
/**
 * Applies the desktop app's migrations to the sync Worker's D1 database.
 *
 * The spec (§2, Risk 3) is explicit that D1 and the local SQLite must not
 * diverge, and the way to guarantee that is to keep one set of files and run
 * them in both places — never a hand-written `CREATE TABLE` for the cloud. This
 * script is that second run.
 *
 *     node scripts/d1-migrate.mjs --local              # a local D1, for testing
 *     node scripts/d1-migrate.mjs --remote             # the real database
 *     node scripts/d1-migrate.mjs --create             # create cmis-prod, write its id
 *
 * `--create` runs `wrangler d1 create`, then replaces the placeholder
 * `database_id` in `workers/sync/wrangler.toml` with the real one, so a fresh
 * checkout is one command away from a working Worker.
 *
 * Migrations are additive by policy (see `docs/database-migrations.md`): D1 has
 * no migration table of its own here, because `tauri-plugin-sql` owns that on the
 * desktop side and the two must agree. Re-running is therefore safe only because
 * every statement in `src-tauri/migrations` is written to be idempotent — which
 * `import/migrations.test.ts` checks.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const MIGRATIONS_DIR = join(
  REPO_ROOT,
  "apps",
  "desktop",
  "src-tauri",
  "migrations"
);
const CONFIG = join(REPO_ROOT, "workers", "sync", "wrangler.toml");
const DATABASE = "cmis-prod";

const args = new Set(process.argv.slice(2));
const useLocal = args.has("--local");
const useRemote = args.has("--remote");
const create = args.has("--create");

if (!(useLocal || useRemote || create)) {
  console.error(
    "Usage: node scripts/d1-migrate.mjs [--local | --remote] [--create]\n" +
      "  --local   apply every migration to wrangler's local D1 (safe, disposable)\n" +
      "  --remote  apply every migration to the deployed D1 database\n" +
      "  --create  create the D1 database and write its id into wrangler.toml"
  );
  process.exit(2);
}

const IS_WINDOWS = process.platform === "win32";
// `execFileSync("npx.cmd", …)` fails with EINVAL on Windows — .cmd shims need a
// shell to resolve. On Windows the command is run as one quoted string instead
// of (command + args): an args array with `shell: true` is concatenated
// unquoted (DEP0190) and breaks on paths with spaces.

const NEEDS_QUOTES = /[\s"]/u;

function quoteArg(arg) {
  return NEEDS_QUOTES.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function run(command, commandArgs) {
  console.log(`\n$ ${command} ${commandArgs.join(" ")}`);
  if (!IS_WINDOWS) {
    execFileSync(command, commandArgs, { cwd: REPO_ROOT, stdio: "inherit" });
    return;
  }
  execFileSync([command, ...commandArgs].map(quoteArg).join(" "), {
    cwd: REPO_ROOT,
    shell: true,
    stdio: "inherit",
  });
}

function wrangler(commandArgs) {
  // `npx` rather than a local dependency: `workers/sync` is deliberately outside
  // the pnpm workspace, so wrangler is resolved on demand.
  run("npx", ["wrangler", ...commandArgs]);
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

if (create) {
  const createArgs = ["wrangler", "d1", "create", DATABASE];
  const output = IS_WINDOWS
    ? execFileSync(createArgs.map(quoteArg).join(" "), {
        cwd: REPO_ROOT,
        encoding: "utf8",
        shell: true,
        stdio: ["ignore", "pipe", "inherit"],
      })
    : execFileSync("npx", createArgs, {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
      });
  process.stdout.write(output);
  const match = /database_id\s*=\s*"([0-9a-f-]{36})"/u.exec(output);
  if (!match) {
    console.error(
      `\nCould not find a database_id in the output above. Paste it into ${CONFIG} by hand.`
    );
    process.exit(1);
  }
  const config = readFileSync(CONFIG, "utf8");
  writeFileSync(
    CONFIG,
    config.replace(/database_id\s*=\s*"[^"]*"/u, `database_id = "${match[1]}"`)
  );
  console.log(
    `\nWrote database_id ${match[1]} into workers/sync/wrangler.toml`
  );
}

if (useLocal || useRemote) {
  const flag = useLocal ? "--local" : "--remote";
  for (const file of migrationFiles()) {
    wrangler([
      "d1",
      "execute",
      DATABASE,
      flag,
      `--file=${join(MIGRATIONS_DIR, file)}`,
      `--config=${CONFIG}`,
      "--yes",
    ]);
  }
  console.log(`\nApplied ${migrationFiles().length} migrations (${flag}).`);
}
