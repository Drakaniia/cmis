-- 0005_strength_fields.sql — support the structured strength fields.
--
-- `inventory_items` already gained `strength_value` / `strength_unit` / `form` /
-- `pack_size` / `display_name` in 0004. This migration adds only what the
-- strength-fields spec still needs:
--
--   * `app_meta` — the small key/value table the run-once startup backfill
--     records itself in, so it never re-splits a database twice (§6.3).
--   * an index over the strength pair, which the lists search (§8.1 list label)
--     and `use-inventory-filters` filters on.
--
-- `dosage` is deliberately left in place. The backfill still has to read it, and
-- migrations run in Rust before any JavaScript does — dropping it here would
-- throw the backfill's only input away. The backfill drops it itself, once, after
-- it has finished reading (spec §6.2 option A).

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_inventory_strength
  ON inventory_items (strength_value, strength_unit);
