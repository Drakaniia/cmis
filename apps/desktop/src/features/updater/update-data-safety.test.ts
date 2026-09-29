import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PACKAGE_ROOT } from "@/test/project-paths";

/**
 * The updater must never be able to cost a clinic its records.
 *
 * The install itself is already safe by construction: `cmis.db` is a relative
 * `sqlite:` URL that the SQL plugin resolves inside the app-config directory,
 * while the updater replaces the install directory — two different places. These
 * tests hold that arrangement in place, so a future refactor that reaches for
 * the wipe path, drops a table, or relocates the database fails here instead of
 * on a user's machine.
 */

const UPDATER_DIR = join(PACKAGE_ROOT, "src", "features", "updater");

function updaterSources(): { file: string; source: string }[] {
  return readdirSync(UPDATER_DIR, { encoding: "utf8", recursive: true })
    .filter((name) => /\.tsx?$/.test(name))
    .filter((name) => !name.includes(".test."))
    .map((name) => ({
      file: name,
      source: readFileSync(join(UPDATER_DIR, name), "utf8"),
    }));
}

describe("updater data safety", () => {
  it("finds the updater sources it is meant to guard", () => {
    // A silently empty file list would make every assertion below vacuous.
    expect(updaterSources().length).toBeGreaterThan(3);
  });

  it.each([
    ["wipeAllData", /wipeAllData/],
    ["the wipe statements", /DELETE FROM/i],
    ["DROP TABLE", /DROP\s+TABLE/i],
    ["VACUUM", /VACUUM/i],
    ["resetSettings", /resetSettings/],
    ["localStorage.clear", /localStorage\.clear/],
  ])("never reaches for %s", (_label, pattern) => {
    const offenders = updaterSources()
      .filter(({ source }) => pattern.test(source))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("keeps the database outside the directory the updater replaces", () => {
    const dbSource = readFileSync(
      join(PACKAGE_ROOT, "src", "lib", "db.ts"),
      "utf8"
    );
    // A bare `sqlite:cmis.db` resolves under the app-config dir. An absolute
    // path, or one under the bundle, would sit inside the install directory the
    // NSIS `/UPDATE` swap replaces.
    const connectionString = dbSource.match(/const DB_URL = "([^"]+)"/)?.[1];
    expect(connectionString).toBe("sqlite:cmis.db");
    expect(connectionString).not.toMatch(/^[A-Za-z]:|[/\\]{1,2}/);
  });

  it("takes a safety backup before it can install anything", () => {
    const hook = readFileSync(join(UPDATER_DIR, "use-updater.tsx"), "utf8");
    expect(hook).toMatch(/writeSafetyBackupFile/);
    // The copy has to come before the installer is handed control, not after.
    const backupAt = hook.indexOf("await writeSafetyBackupFile()");
    const installAt = hook.indexOf("await update.install()");
    expect(backupAt).toBeGreaterThan(-1);
    expect(installAt).toBeGreaterThan(backupAt);
  });
});
