-- CMIS-UI-05 F8/F9 — durable board state.
--
-- `board_position` makes a manual drop order real: a card stays where it was
-- put across a hydrate and a restart, instead of being re-sorted by arrival.
-- `archived_at` is the explicit "cleared from the Claimed lane" marker; the row
-- and every dispensing record stay exactly where they are.
--
-- Migrations are append-only (see src-tauri/src/lib.rs) — never edit a shipped
-- file. This one is registered as version 11.

-- Manual board order per lane: a card stays where it was dropped.
ALTER TABLE requests ADD COLUMN board_position INTEGER NOT NULL DEFAULT 0;

-- Explicitly cleared cards leave the board but keep their records.
ALTER TABLE requests ADD COLUMN archived_at TEXT;

-- Backfill: newest first within each lane, deterministic tie-break on id.
-- A correlated subquery rather than a window function, so the migration runs on
-- the bundled SQLite unchanged.
UPDATE requests SET board_position = (
  SELECT COUNT(*) FROM requests AS other
  WHERE other.status = requests.status
    AND (
      other.submitted_at > requests.submitted_at
      OR (other.submitted_at = requests.submitted_at AND other.id > requests.id)
    )
);

CREATE INDEX IF NOT EXISTS idx_requests_board_order
  ON requests (status, board_position);
