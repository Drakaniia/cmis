-- 0012_pack_size_fields.sql — the structured pack multiplier (pack-size-handling §7.1).
--
-- Stock stays counted in **base units** — the dose form in `form` (`sachet`,
-- `tab`, `cap`, …) — and one pack multiple sits beside it:
--
--   * `pack_qty`  — how many base units one pack holds. `0` means "not recorded",
--     the same convention as the blank strings around it; `1` is stored as typed
--     and only warned about (V3); `2` or more makes the pair usable for math.
--   * `pack_unit` — the container that multiple is counted in (`box`, `strip`,
--     …), from the shared `domain/vocabulary.ts` list (D17).
--
-- The existing free-text `pack_size` column is deliberately **not** touched or
-- dropped: it is part of `identity_key`/`display_name`, and the run-once startup
-- backfill (F10) pairs these two columns while leaving that text byte-identical
-- so no existing row's identity shifts (PK13).
--
-- There is intentionally **no unit column for stock**. The base unit is derived
-- from `form` (D5); a stored copy would be a second source of truth for one fact.
-- `inventory_batches` is untouched — batches hold whole base units, as today.

ALTER TABLE inventory_items ADD COLUMN pack_qty  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN pack_unit TEXT    NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_inventory_pack
  ON inventory_items (pack_qty, pack_unit);
