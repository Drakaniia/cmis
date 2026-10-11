-- 0014_sync_metadata.sql — change capture for CMIS Cloud Sync.
--
-- Cloud sync is a *scan*, not a list of hooks. Every synced table gains an
-- `updated_at`, a trigger keeps it honest on every write, and a
-- `sync_tombstones` row records every hard delete. The desktop client then
-- pushes "everything newer than my cursor" and pulls "everything newer than my
-- cursor" — so a write the app performs today, tomorrow, or from a code path
-- nobody remembered to instrument is still synced. The alternative, a
-- `markDirty()` call beside each of the ~50 write sites, is a list that rots the
-- first time someone adds a mutation.
--
-- Why triggers rather than application code:
--   * `requests`, `request_history`, `request_notes` and `dispensing_records`
--     never wrote a timestamp at all, and `saveRequest` rewrites the children
--     wholesale (DELETE + INSERT) — there is no single statement to hook.
--   * `inventory_batches` has no timestamp column either.
--   * The trigger is the only place that sees an UPDATE that forgot the column,
--     which is exactly the class of bug that would silently lose a change.
--
-- The rule the triggers follow, and the reason they are safe on both sides:
--   * INSERT stamping only fires when `updated_at IS NULL`, so a row applied
--     from the cloud (which always carries the originating device's timestamp)
--     keeps that timestamp instead of being restamped as "now" on every device.
--   * UPDATE stamping only fires when the statement left `updated_at`
--     untouched, so `inventory_items`' existing explicit `updated_at` writes
--     still win, and a cloud-applied update is not rewritten either.
-- Because the triggers preserve an explicit value, this same migration runs
-- against the Cloudflare D1 replica (see `workers/sync`), where the Worker
-- writes the payload's timestamps verbatim.
--
-- Values are ISO-8601 UTC with milliseconds (`strftime('%Y-%m-%dT%H:%M:%fZ')`),
-- so plain string comparison *is* chronological comparison. `%f` gives
-- `SS.SSS`; the client's `new Date().toISOString()` produces the same shape,
-- which is what lets a local write and a cloud write be compared directly.

-- ---------------------------------------------------------------------------
-- updated_at for the tables that never had one.
-- ---------------------------------------------------------------------------
-- `dispensing_records` is rebuilt rather than altered, for the reason migration
-- 0007 rebuilt it: SQLite has no `ADD COLUMN IF NOT EXISTS` and this table is
-- replaced wholesale on every request save, so the migration harness
-- (`import/migrations.test.ts`) re-runs each file to prove idempotence — and a
-- table rebuilt by a *later* re-run of 0007 comes back without the column a bare
-- `CREATE INDEX` here would then fail on. Rebuilding keeps the file re-runnable
-- and copies the rows across 1:1, ids included.
CREATE TABLE IF NOT EXISTS dispensing_records_sync_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  at         TEXT NOT NULL,
  batch      TEXT NOT NULL,
  expiry     TEXT NOT NULL,
  qty        INTEGER NOT NULL,
  staff      TEXT NOT NULL,
  updated_at TEXT
);

INSERT INTO dispensing_records_sync_new (id, request_id, at, batch, expiry, qty, staff, updated_at)
  SELECT id, request_id, at, batch, expiry, qty, staff, at FROM dispensing_records;

DROP TABLE dispensing_records;
ALTER TABLE dispensing_records_sync_new RENAME TO dispensing_records;

-- Recreated because the rebuild above drops the table's indexes with it.
CREATE INDEX IF NOT EXISTS idx_dispensing_records_request
  ON dispensing_records (request_id, at);

-- Single-line ALTERs so the harness can strip them on a re-run; the plugin runs
-- each version exactly once, and `ADD COLUMN` is the one statement SQLite offers
-- no `IF NOT EXISTS` for.
ALTER TABLE requests ADD COLUMN updated_at TEXT;
ALTER TABLE request_history ADD COLUMN updated_at TEXT;
ALTER TABLE request_notes ADD COLUMN updated_at TEXT;
ALTER TABLE inventory_batches ADD COLUMN updated_at TEXT;

-- Backfill, newest evidence first, so a pre-sync row is ordered by when it
-- actually happened. `submitted_at` and `at` are real event times; a migration
-- clock would make this device's entire history look like it changed at
-- migration time and win every first-sync conflict.
UPDATE requests
   SET updated_at = COALESCE(updated_at, archived_at, submitted_at)
 WHERE updated_at IS NULL;
UPDATE request_history
   SET updated_at = COALESCE(updated_at, at)
 WHERE updated_at IS NULL;
UPDATE request_notes
   SET updated_at = COALESCE(updated_at, at)
 WHERE updated_at IS NULL;
-- `inventory_batches` has no timestamp of its own, so it borrows the parent
-- item's: a batch entered before sync existed is at least as old as the last
-- edit to the product it belongs to. An orphaned batch falls back to the epoch,
-- deliberately *not* to `now()` — "oldest" means any device's later edit wins,
-- where "now" would mean this device's copy silently overwrites the other's.
UPDATE inventory_batches
   SET updated_at = COALESCE(
         updated_at,
         (SELECT i.updated_at FROM inventory_items i WHERE i.id = inventory_batches.item_id),
         '1970-01-01T00:00:00.000Z'
       )
 WHERE updated_at IS NULL;

-- The push and pull scans are `WHERE updated_at > ? ORDER BY updated_at`, so the
-- column is indexed on every table the client walks.
CREATE INDEX IF NOT EXISTS idx_requests_updated_at ON requests (updated_at);
CREATE INDEX IF NOT EXISTS idx_request_history_updated_at ON request_history (updated_at);
CREATE INDEX IF NOT EXISTS idx_request_notes_updated_at ON request_notes (updated_at);
CREATE INDEX IF NOT EXISTS idx_dispensing_records_updated_at ON dispensing_records (updated_at);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_updated_at ON inventory_batches (updated_at);

-- ---------------------------------------------------------------------------
-- Sync bookkeeping.
-- ---------------------------------------------------------------------------
-- Device-local sync state: `device_id`, one row cursor per synced table, the
-- tombstone cursor, the last successful sync, and the one-time migration
-- markers. A key/value table rather than columns on `app_meta` because
-- "Reset settings" deletes `app_meta` and a reset must not make this device
-- re-upload its whole history.
CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- A hard delete leaves nothing behind to scan, so it is recorded here instead.
-- `row_key` is the table's own primary key for a parent table, and the
-- *content* key for the request children — `request_history`, `request_notes`
-- and `dispensing_records` are rewritten wholesale on every save (their
-- AUTOINCREMENT ids churn on every `saveRequest`), so the identity of a child
-- row is its content, exactly as the client computes it in
-- `apps/desktop/src/lib/sync/schema.ts`. `schema.test.ts` pins the two
-- spellings together by deleting a row through SQLite and comparing the
-- tombstone it writes with the key the client would compute.
--
-- The primary key is `(table_name, row_key)`, i.e. one tombstone per row: a
-- delete after a delete is the same statement, not a second row.
CREATE TABLE IF NOT EXISTS sync_tombstones (
  table_name TEXT NOT NULL,
  row_key    TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  device_id  TEXT,
  PRIMARY KEY (table_name, row_key)
);

CREATE INDEX IF NOT EXISTS idx_sync_tombstones_deleted
  ON sync_tombstones (deleted_at);

-- ---------------------------------------------------------------------------
-- Insert stamping: a row the app creates without a timestamp gets the clock.
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_requests_stamp_updated_at
AFTER INSERT ON requests FOR EACH ROW WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE requests SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_request_history_stamp_updated_at
AFTER INSERT ON request_history FOR EACH ROW WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE request_history SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_request_notes_stamp_updated_at
AFTER INSERT ON request_notes FOR EACH ROW WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE request_notes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_dispensing_records_stamp_updated_at
AFTER INSERT ON dispensing_records FOR EACH ROW WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE dispensing_records SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_batches_stamp_updated_at
AFTER INSERT ON inventory_batches FOR EACH ROW WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE inventory_batches SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

-- ---------------------------------------------------------------------------
-- Update stamping, for the writes that did not name the column.
-- ---------------------------------------------------------------------------
-- `WHEN NEW.updated_at IS OLD.updated_at` — the statement left the column as it
-- found it, which is how every `inventory_items` write that *does* set it
-- explicitly (and every cloud-applied row) escapes the trigger. The nested
-- UPDATE supplies a different value, so its own `WHEN` is false and there is no
-- recursion.
CREATE TRIGGER IF NOT EXISTS trg_requests_touch_updated_at
AFTER UPDATE ON requests FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE requests SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_request_history_touch_updated_at
AFTER UPDATE ON request_history FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE request_history SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_request_notes_touch_updated_at
AFTER UPDATE ON request_notes FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE request_notes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_dispensing_records_touch_updated_at
AFTER UPDATE ON dispensing_records FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE dispensing_records SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_batches_touch_updated_at
AFTER UPDATE ON inventory_batches FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE inventory_batches SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

-- `inventory_items`, `vocabulary_terms` and `categories` already maintain
-- `updated_at` in application code, but their INSERTs are covered too so a row
-- created by a path that forgot cannot sit invisible to sync forever. Their
-- updates need no trigger: every writer they have passes the column.
CREATE TRIGGER IF NOT EXISTS trg_inventory_items_stamp_updated_at
AFTER INSERT ON inventory_items FOR EACH ROW WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE inventory_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_vocabulary_terms_stamp_updated_at
AFTER INSERT ON vocabulary_terms FOR EACH ROW WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE vocabulary_terms SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_categories_stamp_updated_at
AFTER INSERT ON categories FOR EACH ROW WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE categories SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

-- ---------------------------------------------------------------------------
-- Delete capture.
-- ---------------------------------------------------------------------------
-- One trigger per synced table. A parent's tombstone is enough on its own:
-- `requests` cascades to its children and `inventory_items` to its batches, so
-- applying the parent delete on another device removes them there too. The
-- child triggers still exist because a child can be deleted on its own (a note
-- removed from a request, a batch purged from an item), and a cascade does fire
-- them (verified against SQLite: `ON DELETE CASCADE` fires the child's delete
-- trigger), which makes the extra tombstones harmless duplicates of a delete the
-- parent's tombstone already implies.
--
-- `ON CONFLICT ... DO UPDATE` keeps the newest delete time: re-deleting a row
-- whose id was reused (a restored item, then deleted again) must move the
-- tombstone forward, not silently keep the stale one.
CREATE TRIGGER IF NOT EXISTS trg_requests_tombstone
AFTER DELETE ON requests FOR EACH ROW
BEGIN
  INSERT INTO sync_tombstones (table_name, row_key, deleted_at, device_id)
  VALUES ('requests', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
          (SELECT value FROM sync_state WHERE key = 'device_id'))
  ON CONFLICT(table_name, row_key) DO UPDATE SET
    deleted_at = excluded.deleted_at,
    device_id  = excluded.device_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_request_history_tombstone
AFTER DELETE ON request_history FOR EACH ROW
BEGIN
  INSERT INTO sync_tombstones (table_name, row_key, deleted_at, device_id)
  VALUES ('request_history',
          OLD.request_id || char(31) || OLD.at || char(31) || OLD.actor || char(31) ||
          COALESCE(OLD.from_status, '') || char(31) || OLD.to_status || char(31) ||
          COALESCE(OLD.note, ''),
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
          (SELECT value FROM sync_state WHERE key = 'device_id'))
  ON CONFLICT(table_name, row_key) DO UPDATE SET
    deleted_at = excluded.deleted_at,
    device_id  = excluded.device_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_request_notes_tombstone
AFTER DELETE ON request_notes FOR EACH ROW
BEGIN
  INSERT INTO sync_tombstones (table_name, row_key, deleted_at, device_id)
  VALUES ('request_notes',
          OLD.request_id || char(31) || OLD.at || char(31) || OLD.author || char(31) || OLD.text,
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
          (SELECT value FROM sync_state WHERE key = 'device_id'))
  ON CONFLICT(table_name, row_key) DO UPDATE SET
    deleted_at = excluded.deleted_at,
    device_id  = excluded.device_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_dispensing_records_tombstone
AFTER DELETE ON dispensing_records FOR EACH ROW
BEGIN
  INSERT INTO sync_tombstones (table_name, row_key, deleted_at, device_id)
  VALUES ('dispensing_records',
          OLD.request_id || char(31) || OLD.at || char(31) || OLD.batch || char(31) ||
          OLD.expiry || char(31) || OLD.qty || char(31) || OLD.staff,
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
          (SELECT value FROM sync_state WHERE key = 'device_id'))
  ON CONFLICT(table_name, row_key) DO UPDATE SET
    deleted_at = excluded.deleted_at,
    device_id  = excluded.device_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_items_tombstone
AFTER DELETE ON inventory_items FOR EACH ROW
BEGIN
  INSERT INTO sync_tombstones (table_name, row_key, deleted_at, device_id)
  VALUES ('inventory_items', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
          (SELECT value FROM sync_state WHERE key = 'device_id'))
  ON CONFLICT(table_name, row_key) DO UPDATE SET
    deleted_at = excluded.deleted_at,
    device_id  = excluded.device_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_batches_tombstone
AFTER DELETE ON inventory_batches FOR EACH ROW
BEGIN
  INSERT INTO sync_tombstones (table_name, row_key, deleted_at, device_id)
  VALUES ('inventory_batches', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
          (SELECT value FROM sync_state WHERE key = 'device_id'))
  ON CONFLICT(table_name, row_key) DO UPDATE SET
    deleted_at = excluded.deleted_at,
    device_id  = excluded.device_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_vocabulary_terms_tombstone
AFTER DELETE ON vocabulary_terms FOR EACH ROW
BEGIN
  INSERT INTO sync_tombstones (table_name, row_key, deleted_at, device_id)
  VALUES ('vocabulary_terms', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
          (SELECT value FROM sync_state WHERE key = 'device_id'))
  ON CONFLICT(table_name, row_key) DO UPDATE SET
    deleted_at = excluded.deleted_at,
    device_id  = excluded.device_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_categories_tombstone
AFTER DELETE ON categories FOR EACH ROW
BEGIN
  INSERT INTO sync_tombstones (table_name, row_key, deleted_at, device_id)
  VALUES ('categories', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
          (SELECT value FROM sync_state WHERE key = 'device_id'))
  ON CONFLICT(table_name, row_key) DO UPDATE SET
    deleted_at = excluded.deleted_at,
    device_id  = excluded.device_id;
END;

-- NOTE ON WHAT IS DELIBERATELY NOT SYNCED
--
-- `dispensing_events`, `audit_log`, `trash_records` and `app_meta` keep no sync
-- columns and no triggers:
--   * `dispensing_events` is the month-scoped aggregate the workbook import
--     writes. It is keyed by `(item_id, date)` rather than a stable id, it is
--     regenerated by re-importing the month, and it is the largest table in the
--     database — syncing it would ship the most bytes for the least benefit. Its
--     rows do follow their item through `ON DELETE CASCADE`.
--   * `audit_log` is this device's trail of what *it* did. Merging two devices'
--     trails by timestamp would put an action next to an actor that never
--     performed it; the sync engine writes its own conflict entries into it
--     (action `sync`) instead, which keeps the log locally truthful.
--   * `trash_records` is a recovery aid for a mistake made on this machine.
--   * `app_meta` holds device-local run-once markers, whose whole point is that
--     they are per-device.
