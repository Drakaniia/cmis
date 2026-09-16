-- 0006_categories.sql — the category list becomes data, not a hardcoded list.
--
-- Until now `INVENTORY_CATEGORIES` in `features/inventory/types.ts` was the only
-- source: seven strings that the forms, the wizard, the edit panel and the filter
-- bars each rendered from, while Settings → Categories edited a React state that
-- nothing else could see. One table removes both problems — the operator's own
-- groupings survive a restart, and every dropdown reads the same rows.
--
-- `COLLATE NOCASE` is on the column rather than on each comparison so the UNIQUE
-- index is case-insensitive too: "Analgesic" and "analgesic" are the same
-- category, and the duplicate check cannot be defeated by capitalisation.

CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Every read of this table orders by name with the same collation
-- (`ORDER BY name COLLATE NOCASE` in `data/categories.ts`), which is what this
-- index serves. `COLLATE NOCASE` is repeated because an index only satisfies an
-- ordering whose collation matches its own.
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name COLLATE NOCASE);

-- The shipped taxonomy, so a fresh database opens with a usable dropdown rather
-- than an empty one. Fixed ids and `OR IGNORE` make this statement replay-safe.
INSERT OR IGNORE INTO categories (id, name, created_at, updated_at)
VALUES
  ('cat-analgesic',  'Analgesic',  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('cat-antibiotic', 'Antibiotic', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('cat-antiseptic', 'Antiseptic', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('cat-supplement', 'Supplement', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('cat-respiratory','Respiratory',strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('cat-gastro',     'Gastro',     strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('cat-first-aid',  'First Aid',  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

-- Anything the inventory already carries that is not one of the seven above —
-- an imported workbook, a legacy row — is adopted rather than dropped. Without
-- this the item keeps a category the dropdowns would no longer offer, and the
-- operator would have to retype the name to pick it again.
INSERT OR IGNORE INTO categories (id, name, created_at, updated_at)
SELECT
  'cat-' || lower(replace(trim(category), ' ', '-')),
  trim(category),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM inventory_items
WHERE category IS NOT NULL
  AND trim(category) <> ''
GROUP BY trim(category)
ORDER BY trim(category);
