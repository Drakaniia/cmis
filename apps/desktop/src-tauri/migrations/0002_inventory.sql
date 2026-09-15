-- 0002_inventory.sql — device-local inventory (spec §4.1)
CREATE TABLE IF NOT EXISTS inventory_items (
  id                TEXT PRIMARY KEY,
  sku               TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  dosage            TEXT NOT NULL DEFAULT '',
  dosage_missing    INTEGER NOT NULL DEFAULT 0,
  stock_on_hand     INTEGER,
  total_dispensed   INTEGER NOT NULL DEFAULT 0,
  stock_remaining   INTEGER,
  daily_sum         INTEGER NOT NULL DEFAULT 0,
  total_mismatch    INTEGER NOT NULL DEFAULT 0,
  qty               INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'out',
  needs_batch       INTEGER NOT NULL DEFAULT 1,
  category          TEXT,
  supplier          TEXT,
  threshold         INTEGER NOT NULL DEFAULT 20,
  is_no_stock       INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_status   ON inventory_items(status);
CREATE INDEX IF NOT EXISTS idx_inventory_name_dosage ON inventory_items(name, dosage);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  batch       TEXT NOT NULL,
  expiry      TEXT,
  qty         INTEGER NOT NULL,
  supplier    TEXT
);
CREATE INDEX IF NOT EXISTS idx_batches_item ON inventory_batches(item_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory_batches(expiry);
