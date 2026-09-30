-- 0013_vocabulary_terms.sql — the strength unit, dose form and pack unit lists
-- become data, the way `categories` became data in 0006.
--
-- Until now `STRENGTH_UNITS`, `MEDICINE_FORMS` and `PACK_UNITS` in
-- `features/inventory/domain/vocabulary.ts` were compile-time `as const` arrays.
-- The category dropdown grew a create/rename/delete panel in 0006; these three
-- stayed native `<select>` elements, so a unit the clinic actually stocks could
-- not be recorded without editing source and shipping a build. One table removes
-- that — the operator's own vocabulary survives a restart, and every form, the
-- stock-in wizard, the edit panel and the delivery sheet read the same rows.
--
-- One table with a `kind` discriminator rather than three tables: there is one
-- data layer, one hook set and one picker to write, and the three lists have
-- identical rules. Uniqueness is scoped to `(kind, name)` rather than `name`
-- alone because `box` is legitimately both a dose form and a pack container
-- today (`SEED_MEDICINE_FORMS` and `SEED_PACK_UNITS` both carry it), and
-- collapsing them would make the two dropdowns unable to hold the same word.
--
-- `COLLATE NOCASE` is on the column rather than on each comparison, for the
-- reason migration 0006 gives: "mg" and "MG" are the same unit, and the
-- duplicate check cannot be defeated by capitalisation.

CREATE TABLE IF NOT EXISTS vocabulary_terms (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('strength_unit', 'form', 'pack_unit')),
  name       TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (kind, name)
);

-- Every read of this table filters on `kind` and orders by name with the same
-- collation (`ORDER BY name COLLATE NOCASE` in `data/vocabulary-terms.ts`),
-- which is what this composite index serves. `COLLATE NOCASE` is repeated
-- because an index only satisfies an ordering whose collation matches its own.
CREATE INDEX IF NOT EXISTS idx_vocabulary_terms_list
  ON vocabulary_terms(kind, name COLLATE NOCASE);

-- The shipped vocabularies, so a fresh database opens with usable dropdowns
-- rather than empty ones. Fixed ids and `OR IGNORE` make this replay-safe.
--
-- These are the 41-column template's own tokens, not a clinical wish-list, and
-- they are pinned to `scripts/inventory_vocabulary.py` by
-- `domain/vocabulary.test.ts`. The Python module stays the seed source for the
-- template tooling; what the operator adds in the app is an extension the
-- workbook cannot know about, which is a deliberate and documented limit.
INSERT OR IGNORE INTO vocabulary_terms (id, kind, name, created_at, updated_at)
VALUES
  -- strength units
  ('vt-strength-unit-mg',      'strength_unit', 'mg',      strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-strength-unit-g',       'strength_unit', 'g',       strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-strength-unit-mcg',     'strength_unit', 'mcg',     strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-strength-unit-ml',      'strength_unit', 'ml',      strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-strength-unit-mg-ml',   'strength_unit', 'mg/ml',   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-strength-unit-mg-5ml',  'strength_unit', 'mg/5ml',  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-strength-unit-percent', 'strength_unit', '%',       strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-strength-unit-iu',      'strength_unit', 'IU',      strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-strength-unit-units',   'strength_unit', 'units',   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  -- dose forms
  ('vt-form-tablet',      'form', 'tablet',      strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-capsule',     'form', 'capsule',     strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-cap',         'form', 'cap',         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-sachet',      'form', 'sachet',      strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-syrup',       'form', 'syrup',       strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-suspension',  'form', 'suspension',  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-susp',        'form', 'susp',        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-ointment',    'form', 'ointment',    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-cream',       'form', 'cream',       strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-drops',       'form', 'drops',       strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-vial',        'form', 'vial',        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-ampule',      'form', 'ampule',      strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-nebule',      'form', 'nebule',      strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-injection',   'form', 'injection',   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-suppository', 'form', 'suppository', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-box',         'form', 'box',         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-piece',       'form', 'piece',       strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-tabs',        'form', 'tabs',        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-tab',         'form', 'tab',         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-inhaler',     'form', 'inhaler',     strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-solution',    'form', 'solution',    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-gel',         'form', 'gel',         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-lotion',      'form', 'lotion',      strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-form-spray',       'form', 'spray',       strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  -- pack units
  ('vt-pack-unit-box',    'pack_unit', 'box',    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-pack-unit-strip',  'pack_unit', 'strip',  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-pack-unit-pack',   'pack_unit', 'pack',   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-pack-unit-carton', 'pack_unit', 'carton', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-pack-unit-bottle', 'pack_unit', 'bottle', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('vt-pack-unit-tube',   'pack_unit', 'tube',   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

-- Anything the inventory already carries that is not in the seeds above — an
-- imported workbook, a legacy row, a value this table has never heard of — is
-- adopted rather than dropped. Without this the item keeps a unit or form the
-- dropdowns would no longer offer, and the operator would have to retype it to
-- pick it again. The reference workbook's leftover `piece/bx` (E25) is exactly
-- this case.
--
-- One statement per column because the three live in different columns of
-- `inventory_items`. `COLLATE NOCASE` on the UNIQUE constraint is what collapses
-- 'Tab' and 'tab' into one row here, so the derived slug below can collide
-- harmlessly and `OR IGNORE` keeps the first.
INSERT OR IGNORE INTO vocabulary_terms (id, kind, name, created_at, updated_at)
SELECT
  'vt-strength-unit-' || lower(replace(trim(strength_unit), ' ', '-')),
  'strength_unit',
  trim(strength_unit),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM inventory_items
WHERE strength_unit IS NOT NULL
  AND trim(strength_unit) <> ''
GROUP BY trim(strength_unit)
ORDER BY trim(strength_unit);

INSERT OR IGNORE INTO vocabulary_terms (id, kind, name, created_at, updated_at)
SELECT
  'vt-form-' || lower(replace(trim(form), ' ', '-')),
  'form',
  trim(form),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM inventory_items
WHERE form IS NOT NULL
  AND trim(form) <> ''
GROUP BY trim(form)
ORDER BY trim(form);

INSERT OR IGNORE INTO vocabulary_terms (id, kind, name, created_at, updated_at)
SELECT
  'vt-pack-unit-' || lower(replace(trim(pack_unit), ' ', '-')),
  'pack_unit',
  trim(pack_unit),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM inventory_items
WHERE pack_unit IS NOT NULL
  AND trim(pack_unit) <> ''
GROUP BY trim(pack_unit)
ORDER BY trim(pack_unit);

-- NOTE ON WHAT IS DELIBERATELY NOT HERE
--
-- `PACK_CONTAINER_TOKENS` (`vial`, `ampule`, `nebule`) are **not** seeded as
-- `pack_unit` terms. They are the containers the *parser* may read off a legacy
-- `pack_size` cell — the reference workbook's leftover bucket names them, and a
-- `(10/vial)` group is still an unambiguous multiple worth pairing. They are
-- read-only by design: a new item may only be *written* in a term the operator
-- picked from the list, and offering the parser's leftovers in that list would
-- invite recording a pack in a container the clinic does not use. A test in
-- `domain/vocabulary.test.ts` pins this.
--
-- A unit or form added in the app is likewise unknown to the workbook's
-- `DataValidation` list, which is authored from the Python seed tuples in
-- `scripts/inventory_vocabulary.py`. The exporter writes stored
-- values verbatim, so an exported workbook is correct; only a hand-edit of that
-- cell in Excel is refused. That is the same trade-off the pre-0013
-- `vocabulary.test.ts` header already documented, and it is the price of the
-- operator not having to ship a build to spell a unit correctly.
