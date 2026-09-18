-- 0009_request_item_id.sql — link a request to its inventory item (AF13).
--
-- `requests.medicine` is free text, not a foreign key: the stock checks and the
-- history query both match by normalized string (`medicine-match.ts`), so renaming
-- an item's display name silently detaches its request history. The daily
-- aggregate `dispensing_events` is already keyed by `item_id`, but the request
-- row itself had no stable link — only the text it was created with.
--
-- This adds a nullable `item_id` that points at `inventory_items(id)` and is
-- filled for every request created after this migration. Existing rows stay
-- NULL and keep the textual fallback, so the migration is backfill-free.
-- When the item is deleted the link is nulled rather than cascading the
-- request away — the request's own audit trail must survive a product deletion.
--
-- Append-only: migrations 0001–0008 are shipped and must never be edited. This
-- file is registered as version 9 in `db_migrations()`.

ALTER TABLE requests ADD COLUMN item_id TEXT REFERENCES inventory_items (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_requests_item_id ON requests (item_id);
