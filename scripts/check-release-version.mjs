/**
 * Release version guard.
 *
 * The tag drives three artifacts that must agree: the Tauri bundle (and the
 * `latest.json` the updater reads), the Rust crate, and the npm packages. A
 * mismatch ships a build that advertises one version and installs another, so
 * the release workflow fails instead of publishing.
 *
 *   node scripts/check-release-version.mjs v0.1.0
 *
 * Exits 0 when every manifest matches the tag, 1 otherwise.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

/** `1.2.3`, optionally `1.2.3-beta.1`. */
const SEMVER = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/;
const LEADING_V = /^v/;
const VERSION_ASSIGNMENT = /^version\s*=\s*"([^"]+)"/;
const NEWLINE = /\r?\n/;

/**
 * The `[package]` section's version — not a dependency's, which Cargo.toml also
 * spells `version = "..."`.
 */
function cargoPackageVersion(contents) {
  let inPackageSection = false;
  for (const line of contents.split(NEWLINE)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      inPackageSection = trimmed === "[package]";
      continue;
    }
    if (inPackageSection) {
      const match = VERSION_ASSIGNMENT.exec(trimmed);
      if (match) {
        return match[1];
      }
    }
  }
  throw new Error("Cargo.toml has no version in its [package] section");
}

function jsonVersion(contents) {
  return JSON.parse(contents).version;
}

const MANIFESTS = [
  {
    label: "package.json",
    path: "package.json",
    read: jsonVersion,
  },
  {
    label: "apps/desktop/package.json",
    path: "apps/desktop/package.json",
    read: jsonVersion,
  },
  {
    label: "apps/desktop/src-tauri/tauri.conf.json",
    path: "apps/desktop/src-tauri/tauri.conf.json",
    read: jsonVersion,
  },
  {
    label: "apps/desktop/src-tauri/Cargo.toml",
    path: "apps/desktop/src-tauri/Cargo.toml",
    read: cargoPackageVersion,
  },
];

function collectVersions(expected) {
  const rows = [];
  for (const manifest of MANIFESTS) {
    const contents = readFileSync(resolve(REPO_ROOT, manifest.path), "utf8");
    const version = manifest.read(contents);
    rows.push({
      label: manifest.label,
      matches: version === expected,
      version: version ?? "(missing)",
    });
  }
  return rows;
}

function report(tag, expected, rows) {
  const width = Math.max(...rows.map((row) => row.label.length));
  const lines = [
    `release version guard: tag ${tag} → expected ${expected}`,
    ...rows.map(
      (row) =>
        `  ${row.matches ? "ok  " : "FAIL"} ${row.label.padEnd(width)}  ${row.version}`
    ),
  ];
  const failures = rows.filter((row) => !row.matches);
  if (failures.length > 0) {
    lines.push(
      `mismatch: ${failures
        .map((row) => `${row.label}=${row.version}`)
        .join(", ")} — every manifest must equal ${expected}`
    );
  }
  const stream = failures.length > 0 ? process.stderr : process.stdout;
  stream.write(`${lines.join("\n")}\n`);
  return failures.length;
}

function main() {
  const [, , tag] = process.argv;
  if (!tag) {
    process.stderr.write(
      "usage: node scripts/check-release-version.mjs <tag>  (e.g. v0.1.0)\n"
    );
    process.exitCode = 1;
    return;
  }

  const expected = tag.replace(LEADING_V, "");
  if (!SEMVER.test(expected)) {
    process.stderr.write(`not a version tag: ${tag}\n`);
    process.exitCode = 1;
    return;
  }

  if (report(tag, expected, collectVersions(expected)) > 0) {
    process.exitCode = 1;
  }
}

main();
