import { legacyIdentityKey } from "../domain/identity";
import type { DbLike } from "./db-like";
import { identityKeysOf } from "./draft";
import type { IdentityMatch } from "./validate-draft";

/**
 * What the creation forms need to know about the inventory that already exists:
 * every medicine identity it could collide with, and every SKU in use (spec
 * §9.3 rules 3, §10.1–§10.2).
 *
 * Read as one pass so a form never has to thread several queries together, and
 * built from the *raw* columns — `useInventoryItems` composes a display label,
 * which would break the identity keys if it were used here instead.
 */

export interface IdentityIndex {
  /** Keyed by every key `identityKeysOf` can produce for a stored row. */
  identities: Map<string, IdentityMatch>;
  /** As stored — `deriveSku` compares exact strings (`import/import.ts`). */
  rawSkus: Set<string>;
  /** Lower-cased — `validateNewProduct` compares case-insensitively. */
  skus: Set<string>;
}

interface IdentityRow {
  display_name: string | null;
  /** Read only to build the legacy fallback key (see below). */
  dosage: string | null;
  form: string | null;
  id: string;
  name: string;
  pack_size: string | null;
  sku: string;
  strength_unit: string | null;
  strength_value: string | null;
}

const IDENTITY_SQL =
  "SELECT id, sku, name, dosage, display_name, strength_value, strength_unit, form, pack_size FROM inventory_items";

export function emptyIdentityIndex(): IdentityIndex {
  return { identities: new Map(), rawSkus: new Set(), skus: new Set() };
}

export async function loadIdentityIndex(db: DbLike): Promise<IdentityIndex> {
  const rows = await db.select<IdentityRow[]>(IDENTITY_SQL);
  const index = emptyIdentityIndex();

  for (const row of rows) {
    index.rawSkus.add(row.sku);
    index.skus.add(row.sku.toLowerCase());

    const stored = (row.display_name ?? "").trim();
    const match: IdentityMatch = {
      id: row.id,
      name: stored === "" ? row.name.trim() : stored,
      sku: row.sku,
    };
    const keys = identityKeysOf({
      form: row.form ?? "",
      name: row.name ?? "",
      packSize: row.pack_size ?? "",
      strengthUnit: row.strength_unit ?? "",
      strengthValue: row.strength_value ?? "",
    });
    // A row the backfill has not rewritten is described only by its legacy text;
    // dropping that key would make the form happily create a second copy of a
    // medicine that is already there.
    const dosage = (row.dosage ?? "").trim();
    if (dosage !== "") {
      keys.push(legacyIdentityKey(row.name ?? "", dosage));
    }

    for (const key of keys) {
      // First row wins: the oldest product owns the identity, which is what the
      // operator sees first in Stock Management.
      if (!index.identities.has(key)) {
        index.identities.set(key, match);
      }
    }
  }

  return index;
}
