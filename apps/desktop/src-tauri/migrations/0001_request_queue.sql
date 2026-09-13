-- CMIS-UI-05 Request Queue — durable board state.
-- History, notes and dispensing records are append-only children of a request,
-- so a denied or claimed request keeps its full audit trail after a restart.

CREATE TABLE IF NOT EXISTS requests (
  id             TEXT PRIMARY KEY,
  requestor_name  TEXT NOT NULL,
  requestor_id    TEXT NOT NULL,
  requestor_email TEXT NOT NULL,
  medicine       TEXT NOT NULL,
  category       TEXT NOT NULL,
  qty            INTEGER NOT NULL,
  unit           TEXT NOT NULL,
  reason         TEXT NOT NULL,
  status         TEXT NOT NULL,
  submitted_at   TEXT NOT NULL,
  denied_reason  TEXT,
  denied_note    TEXT
);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests (status);
CREATE INDEX IF NOT EXISTS idx_requests_submitted_at ON requests (submitted_at);

CREATE TABLE IF NOT EXISTS request_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  TEXT NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  at          TEXT NOT NULL,
  actor       TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_request_history_request
  ON request_history (request_id, at);

CREATE TABLE IF NOT EXISTS request_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  at         TEXT NOT NULL,
  author     TEXT NOT NULL,
  text       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_request_notes_request
  ON request_notes (request_id, at);

CREATE TABLE IF NOT EXISTS dispensing_records (
  request_id TEXT PRIMARY KEY REFERENCES requests (id) ON DELETE CASCADE,
  at         TEXT NOT NULL,
  batch      TEXT NOT NULL,
  expiry     TEXT NOT NULL,
  qty        INTEGER NOT NULL,
  staff      TEXT NOT NULL
);
