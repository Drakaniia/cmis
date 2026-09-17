-- 0008_request_source.sql — how a request came to exist.
--
-- A quick deduction (Ctrl+D) lands directly in Claimed with a blank requestor, so
-- without this column it is indistinguishable from a walk-in request created
-- through the queue form: both read "Walk-in", both are Claimed, and neither
-- says how it got there. `source` is what the "Quick deduct" badge reads.
--
-- 'queue' is the default, so every row that already exists — and every row the
-- queue form writes — is correct without a backfill. The only other value today
-- is 'quick-deduct'.
--
-- Append-only: migrations 0001–0007 are shipped and must never be edited. This
-- file is registered as version 8 in `db_migrations()`.

ALTER TABLE requests ADD COLUMN source TEXT NOT NULL DEFAULT 'queue';

CREATE INDEX IF NOT EXISTS idx_requests_source ON requests (source);
