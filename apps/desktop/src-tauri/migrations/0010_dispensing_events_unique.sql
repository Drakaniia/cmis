-- 0010_dispensing_events_unique.sql — make the daily aggregate upsert-safe.
--
-- `dispensing_events` is a daily aggregate: one row per (item_id, date). Two
-- concurrent deductions for the same item on the same day race the old
-- SELECT-then-INSERT/UPDATE path: both see no row and both INSERT, or both read
-- 10 and both write 13, losing one take. The undo path races similarly — it
-- reads 10, a concurrent dispense adds 3, the undo writes 6 and the +3 is lost,
-- floored at 0 hiding the error.
--
-- This migration enforces one row per item per day so the upsert
-- `ON CONFLICT(item_id, date) DO UPDATE SET qty = qty + excluded.qty` is
-- atomic, and the undo `qty = max(qty - ?, 0)` runs as a single UPDATE without
-- a preceding SELECT. Existing duplicates (if any) are deduped by summing.
--
-- Append-only: migrations 0001–0009 are shipped and must never be edited. This
-- file is registered as version 10 in `db_migrations()`.

-- Dedupe any existing duplicates before adding the constraint: keep one row per
-- (item_id, date) with the summed qty and the earliest day/month.
CREATE TABLE IF NOT EXISTS dispensing_events_dedup AS
  SELECT item_id, date, MIN(day) AS day, MIN(month) AS month, SUM(qty) AS qty
  FROM dispensing_events
  GROUP BY item_id, date;

DELETE FROM dispensing_events;

INSERT INTO dispensing_events (item_id, date, day, month, qty)
  SELECT item_id, date, day, month, qty FROM dispensing_events_dedup;

DROP TABLE IF EXISTS dispensing_events_dedup;

-- The old non-unique index would allow the race to reappear; replace it with a
-- unique one so ON CONFLICT has a target.
DROP INDEX IF EXISTS idx_dispensing_item_date;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispensing_item_date ON dispensing_events(item_id, date);
