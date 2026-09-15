-- 0003_dispensing_events.sql — analytics table with month discriminator (spec §4.1)
CREATE TABLE IF NOT EXISTS dispensing_events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id   TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  date      TEXT NOT NULL,
  day       INTEGER NOT NULL CHECK(day BETWEEN 1 AND 31),
  month     TEXT NOT NULL,
  qty       INTEGER NOT NULL,
  UNIQUE(item_id, date)
);
CREATE INDEX IF NOT EXISTS idx_dispensing_item_date ON dispensing_events(item_id, date);
CREATE INDEX IF NOT EXISTS idx_dispensing_month ON dispensing_events(month);
