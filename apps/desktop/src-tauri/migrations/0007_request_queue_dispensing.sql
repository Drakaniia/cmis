-- 0007_request_queue_dispensing.sql — multiple hand-overs per request.
--
-- `dispensing_records` was keyed `request_id PRIMARY KEY`: one row per request,
-- one hand-over per request. Partial dispensing (take what is on the shelf now,
-- leave the remainder in Ready to Claim) makes a second hand-over a real event,
-- so the table is recreated keyed by its own row id and the request becomes an
-- ordinary foreign key.
--
-- Append-only: migrations 0001–0006 are shipped and must never be edited. This
-- file is registered as version 7 in `db_migrations()`.

CREATE TABLE IF NOT EXISTS dispensing_records_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  at         TEXT NOT NULL,
  batch      TEXT NOT NULL,
  expiry     TEXT NOT NULL,
  qty        INTEGER NOT NULL,
  staff      TEXT NOT NULL
);

INSERT INTO dispensing_records_new (request_id, at, batch, expiry, qty, staff)
  SELECT request_id, at, batch, expiry, qty, staff FROM dispensing_records;

DROP TABLE dispensing_records;
ALTER TABLE dispensing_records_new RENAME TO dispensing_records;

CREATE INDEX IF NOT EXISTS idx_dispensing_records_request
  ON dispensing_records (request_id, at);
