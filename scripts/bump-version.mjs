#!/usr/bin/env node
/**
 * Bump app version in all 4 places so `getVersion()` / updater display stays consistent.
 * Usage:
 *   node scripts/bump-version.mjs 1.5.0
 *   node scripts/bump-version.mjs --help
 *
 * CI already stamps the version from the git tag via tauri.yml (--config override),
 * but local files must be bumped for dev display, `cargo build`, and to avoid drift.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const VERSION_RE = /^\d+\.\d+\.\d+$/;
const CARGO_VERSION_RE = /^version\s*=\s*"([^"]+)"/m;
const CARGO_PACKAGE_VERSION_RE = /^(\[package\][^[]*?^version\s*=\s*)"[^"]+"/ms;
const VERSION_PREFIX_RE = /^v/;

function usage() {
  console.log(`Usage: node scripts/bump-version.mjs <x.y.z>
Bumps version in:
  - package.json
  - apps/desktop/package.json
  - apps/desktop/src-tauri/tauri.conf.json
  - apps/desktop/src-tauri/Cargo.toml

Example: node scripts/bump-version.mjs 1.5.0`);
}

const [, , rawArg] = process.argv;
if (!rawArg || rawArg === "--help" || rawArg === "-h") {
  usage();
  process.exit(rawArg ? 0 : 1);
}
const nextVersion = rawArg.replace(VERSION_PREFIX_RE, "");
if (!VERSION_RE.test(nextVersion)) {
  console.error(`Invalid version "${rawArg}" — expected x.y.z (e.g. 1.5.0)`);
  process.exit(1);
}

function bumpJson(path, newVersion) {
  const full = join(root, path);
  const text = readFileSync(full, "utf8");
  const json = JSON.parse(text);
  const prev = json.version;
  json.version = newVersion;
  // preserve trailing newline
  writeFileSync(full, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  console.log(`  ${path}: ${prev} → ${newVersion}`);
}

function bumpCargoToml(newVersion) {
  const path = "apps/desktop/src-tauri/Cargo.toml";
  const full = join(root, path);
  let text = readFileSync(full, "utf8");
  const prev = text.match(CARGO_VERSION_RE)?.[1] ?? "?";
  // only replace the [package] version, not dependency versions
  text = text.replace(CARGO_PACKAGE_VERSION_RE, `$1"${newVersion}"`);
  // Fallback simple replace if above didn't match
  if (!text.includes(`"${newVersion}"`) || prev === newVersion) {
    // do nothing extra
  }
  writeFileSync(full, text, "utf8");
  console.log(`  ${path}: ${prev} → ${newVersion}`);
}

console.log(`Bumping to ${nextVersion}…`);
bumpJson("package.json", nextVersion);
bumpJson("apps/desktop/package.json", nextVersion);
bumpJson("apps/desktop/src-tauri/tauri.conf.json", nextVersion);
bumpCargoToml(nextVersion);
console.log(
  "Done. Run `cargo check` / `pnpm install` if needed and commit the 4 files."
);
