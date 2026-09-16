-- 0004_inventory_creation.sql — Trash, notes, strength columns, audit trail.
--
-- One migration for four prerequisites of the same feature (spec §8): a
-- partially applied batch of ALTER TABLEs is far harder to reason about than a
-- single file that either ran or did not.

-- Snapshot of anything deleted, so restore is a true undo and purge is explicit.
-- Deletion *extracts* rows into this table instead of flagging them, which is
-- why no query in the app needs a `WHERE deleted_at IS NULL` filter.
CREATE TABLE IF NOT EXISTS trash_records (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('item', 'batch')),
  entity_id    TEXT NOT NULL,          -- inventory_items.id or inventory_batches.id
  item_id      TEXT,                   -- parent product, for batch rows
  label        TEXT NOT NULL,          -- "Paracetamol 500mg" / "B-2027-01 · 200 units"
  snapshot     TEXT NOT NULL,          -- JSON: { item, batches[], dispensingEvents[] }
  deleted_at   TEXT NOT NULL,
  deleted_by   TEXT NOT NULL,          -- Settings → Operator name; 'Local user' when blank
  reason       TEXT,                   -- optional operator note
  restore_hint TEXT                    -- e.g. "SKU was SKU-ACET-500"
);
CREATE INDEX IF NOT EXISTS idx_trash_kind    ON trash_records(kind);
CREATE INDEX IF NOT EXISTS idx_trash_deleted ON trash_records(deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_trash_item    ON trash_records(item_id);
CREATE INDEX IF NOT EXISTS idx_trash_entity  ON trash_records(entity_id);

-- Strength / form columns. Owned here so the creation page can ship complete;
-- strength-fields-spec.md inherits them and owns the vocabulary + backfill.
ALTER TABLE inventory_items ADD COLUMN strength_value TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_items ADD COLUMN strength_unit  TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_items ADD COLUMN form          TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_items ADD COLUMN pack_size     TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_items ADD COLUMN display_name  TEXT NOT NULL DEFAULT '';

-- Notes, now actually persisted. App-only: the 41-column template has no notes
-- column, so they must never enter the import/export round-trip.
ALTER TABLE inventory_items ADD COLUMN notes TEXT;
ALTER TABLE inventory_batches ADD COLUMN notes TEXT;

-- Append-only audit trail. Rows are never rewritten: a correction appends a new
-- row that links back through correction_of.
CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT PRIMARY KEY,
  at            TEXT NOT NULL,
  action        TEXT NOT NULL,   -- stock-in | stock-out | request | dispense | user | settings | sync | correction
  actor         TEXT NOT NULL,   -- Settings → Operator name; 'Local user' when blank
  branch        TEXT NOT NULL DEFAULT 'local',
  detail        TEXT NOT NULL,   -- one-line brief shown in the audit table
  target_kind   TEXT,            -- 'item' | 'batch' | 'request' | 'settings'
  target_id     TEXT,            -- inventory_items.id, inventory_batches.id, requests.id
  before_json   TEXT,            -- full before state for the expanded diff
  after_json    TEXT,            -- full after state
  reason        TEXT,            -- required on correction rows
  request_ref   TEXT,            -- linked request / dispensing id
  correction_of TEXT REFERENCES audit_log (id)
);
CREATE INDEX IF NOT EXISTS idx_audit_at     ON audit_log (at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_log (actor);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log (target_kind, target_id);
