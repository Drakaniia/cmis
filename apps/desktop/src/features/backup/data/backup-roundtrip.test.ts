import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

/**
 * The consistent-copy proof (backup-restore spec §11): a database with known
 * rows is copied the way `create_backup` copies it — SQLite itself
 * (`VACUUM INTO`) — and every row matches in the copy with `integrity_check`
 * returning `ok`. `node:sqlite` is the same SQLite engine family the Rust
 * `VACUUM INTO` runs against, so this pins the semantics, not the mock.
 */
describe("backup consistent-copy round trip", () => {
  it("VACUUM INTO carries every row and passes integrity_check", () => {
    const dir = mkdtempSync(join(tmpdir(), "cmis-backup-"));
    const live = join(dir, "live.db");
    const copy = join(dir, "cmis-auto-2026-09-22.db");

    const db = new DatabaseSync(live);
    db.exec("CREATE TABLE inventory_items (id TEXT PRIMARY KEY, name TEXT)");
    db.exec("CREATE TABLE requests (id TEXT PRIMARY KEY, state TEXT)");
    db.prepare("INSERT INTO inventory_items VALUES (?, ?)").run(
      "i1",
      "Paracetamol 500mg"
    );
    db.prepare("INSERT INTO requests VALUES (?, ?)").run("r1", "submitted");

    const target = copy.replaceAll("'", "''");
    db.exec(`VACUUM INTO '${target}'`);
    db.close();

    const restored = new DatabaseSync(copy);
    try {
      const items = restored.prepare("SELECT * FROM inventory_items").all();
      const requests = restored.prepare("SELECT * FROM requests").all();
      const check = restored.prepare("PRAGMA integrity_check").all() as {
        integrity_check: string;
      }[];
      expect(items).toEqual([{ id: "i1", name: "Paracetamol 500mg" }]);
      expect(requests).toEqual([{ id: "r1", state: "submitted" }]);
      expect(check).toEqual([{ integrity_check: "ok" }]);
    } finally {
      restored.close();
    }
    expect(readdirSync(dir).sort()).toEqual([
      "cmis-auto-2026-09-22.db",
      "live.db",
    ]);
  });
});
