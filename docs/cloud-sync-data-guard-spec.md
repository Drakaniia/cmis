# Cloud Sync — Existing-Data & Overwrite Guard Specification

Status: Draft, awaiting implementation
Short name: `cloud-sync-data-guard`
Related: `docs/cloud-sync-spec.md` (the original feature spec), `docs/todo.md`

This spec covers three reported problems in the Cloud Sync feature and the
interview decisions that resolve them. It is a follow-up to
`docs/cloud-sync-spec.md`; that document describes the engine, this one describes
what to do when a device already holds records and the cloud holds different
records.

---

## 1. Reported problems

### P1 — "Check server" says 85 but Stock Management is empty

> When I click **Check server** in the **Status** tab of Cloud Sync settings,
> the `inventory_items` count shows 85, but when I go to the Stock Management
> page the inventory is empty / does not show the actual data.

These two numbers come from **two different databases** and are never compared:

| Surface | Source | Code |
| --- | --- | --- |
| Status card → "In the cloud" counts | Cloudflare D1 via `GET /sync/status` | `workers/sync/src/handler.ts` → `handleStatus`, surfaced by `sync.refreshServerStatus()` in `apps/desktop/src/lib/sync/use-sync.tsx` |
| Stock Management list | Local SQLite `inventory_items` | `useInventoryItems()` in `apps/desktop/src/features/inventory/hooks/use-inventory-items.ts` |

So "85" is a statement about the cloud, and "empty" is a statement about this
device. The bug is that the device **never pulled the cloud rows down**, and the
UI gives the operator no way to see that. Nothing on screen says "this device has
0 rows and the cloud has 85."

Likely causes, to be confirmed with evidence during implementation (see §9):

- **H1 — the pull was skipped by the empty-device guard's inverse.** In
  `SyncProvider.syncNow()` the guard is `isLocalEmpty(db) && serverHasData(current)`
  → pull-only. When the device is *not* empty the engine pushes first and pulls
  second; a device whose local rows are older, or whose pull cursors were already
  advanced, can end a run with the cloud still ahead of it.
- **H2 — the pull ran and `applyRows` skipped the rows.** `applyPullResponse`
  counts skips in `outcome.skipped` (missing parent FK, column mismatch, tombstone
  newer than the row). Those `skipped` counts are not surfaced anywhere in the
  UI, so "downloaded nothing, silently" looks identical to "nothing to download".
- **H3 — cursors already past the data.** `writePullCursors` only ever moves
  forward (`mergeCursors`). A device that pulled from a different/empty cloud, or
  whose pull cursor was advanced by mistake, will never receive rows below that
  cursor again.
- **H4 — sync never actually ran.** Auto-sync only runs when `enabled && endpoint`
  and only after the startup delay / interval / focus / mutation triggers fire.

### P2 — No confirmation when enabling "Sync automatically" with local records

> When I enable **Sync automatically** there should be a confirmation warning:
> "Records already exist on this device. Are you sure you want to sync?"

Today `onEnabledChange` in
`apps/desktop/src/components/sync/sync-settings.tsx` calls `sync.update({enabled:
true, ...})` immediately. If the endpoint is unchanged this runs `syncNow()`
(push-then-pull); if the endpoint changed it runs a pull-only first connection.
Either way it can move data with no prompt.

### P3 — Existing local data vs newer cloud data is not handled

> The Cloud Sync feature is not fully implemented and does not handle edge cases.
> When the device already contains existing data while the actual/latest data is
> in the Cloudflare database, this scenario is not handled correctly.

There is no notion of "the cloud is authoritative for this device", no way to
adopt the cloud copy, and no guard against a device's stale records winning a
last-write-wins conflict against newer cloud records.

---

## 2. Terminology

- **This device** — the local SQLite `cmis.db`.
- **The cloud** — the Cloudflare D1 database reached through the Worker.
- **Synced tables** — the eight tables in `SYNC_TABLES`
  (`apps/desktop/src/lib/sync/schema.ts`): `categories`, `vocabulary_terms`,
  `inventory_items`, `requests`, `inventory_batches`, `request_history`,
  `request_notes`, `dispensing_records`.
- **Overlap** — both this device and the cloud hold at least one row in the
  synced tables.
- **Strategy** — the operator's remembered decision for one endpoint: `local`,
  `cloud`, or `merge`.

---

## 3. Goals

1. Make the cloud-vs-device mismatch **visible** instead of silent (P1).
2. Guarantee a **correct first pull** so a device pointed at a populated cloud
   actually receives that data (P1).
3. **Confirm before enabling** auto-sync when the device already has records (P2).
4. Give the operator an explicit, remembered **choice of authority** when both
   sides hold records, with a safe path to adopt the cloud copy (P3).
5. Never lose local data without a recoverable backup.

## 4. Non-goals

- Changing the last-write-wins engine for the ordinary steady state (it stays
  the default `merge` strategy).
- Real-time/WebSocket sync; polling remains.
- Multi-tenant/auth changes.
- The auto-updater work also described in `docs/todo.md` — out of scope here.

---

## 5. Design decisions (from interview)

| # | Decision | Choice |
| --- | --- | --- |
| D1 | Source of truth when both sides have records | **Ask the user**, per run decision, never a silent overwrite |
| D2 | What "Check server"/Status shows | **Local vs cloud counts side-by-side** |
| D3 | Where the "are you sure" confirmation appears | **Only when toggling "Sync automatically" on** |
| D4 | When the chooser is shown | **Only when both sides have records** |
| D5 | Confirm on the toggle, then what | **Enable immediately; the chooser appears on the first run** that detects the overlap |
| D6 | Cancel the toggle confirmation | **Sync stays off** (nothing enabled, nothing moves) |
| D7 | Later runs where both sides have records | **Ask once, then remember** the strategy |
| D8 | "Take cloud" semantics | **Replace local with cloud** |
| D9 | Local-only records under "take cloud" | **Removed** — the device mirrors the cloud |
| D10 | Backup before a destructive choice | **Automatic local backup first** |
| D11 | Root-cause handling of P1 | **Both**: force a correct initial pull **and** add visible applied/skipped diagnostics |
| D12 | Change scope | Client and Worker; prefer the smallest correct change |
| D13 | Empty device + populated cloud | **Pull silently**, no prompt |
| D14 | Memory scope | **Per endpoint** — repointing at a new Worker asks again |
| D15 | Chooser option labels | **This device's data / Use the cloud copy / Merge (newest wins)** |
| D16 | Backup visibility | **Restorable from the Status tab** (timestamp + row count + restore action) |
| D17 | Diagnostics depth | **Counts + last-run applied/skipped/conflicts** |
| D18 | Toggle modal detail | **Shows local count and cloud count** |

---

## 6. Behaviour specification

### 6.1 Decision table (the core of this spec)

When a sync is about to run against endpoint `E`, first classify the state:

| Local records | Cloud records | Result |
| --- | --- | --- |
| 0 | 0 | Do nothing; phase stays idle. |
| 0 | > 0 | **Full pull, silently** (D13). No prompt, no chooser. |
| > 0 | 0 | Push local records (D12 non-destructive to the device). The toggle confirmation (§6.3) is the only warning. |
| > 0 | > 0 | If a strategy is remembered for `E` → run it silently. Otherwise → **show the chooser** (§6.4), then remember. |

"Records" for this table means rows in the synced tables, counted locally with
`countRows` (`apps/desktop/src/lib/sync/scan.ts`) and remotely from
`/sync/status` `counts`.

### 6.2 Guaranteed first pull (fixes P1)

When the endpoint changes, or no strategy is remembered for the current endpoint,
the device must **not** resume from a stale pull cursor:

1. Reset the pull cursors to empty (`writePullCursors(db, { deleted: "", rows: {} })`,
   the same reset `runPullOnlyPass` already performs).
2. Run a full pull (paged by `pullRemoteChanges`) so the cloud is read from the
   beginning.
3. Report what happened: rows applied, rows **skipped**, conflicts.

Acceptance: a device whose local `inventory_items` is empty and whose cloud
`inventory_items` holds N rows ends the first connection with N local rows, and
the Status tab shows `inventory_items` local count equal to the cloud count.

### 6.3 Enable confirmation (fixes P2)

When the operator ticks **Sync automatically** while the device holds records in
any synced table:

- Show a modal with the exact wording:
  **"Records already exist on this device. Are you sure you want to sync?"**
- The modal also states the counts it is warning about (D18), e.g.
  *"42 records on this device · the cloud holds 85."*
- **Confirm** → enable auto-sync and proceed to §6.1's first run (which may show
  the chooser).
- **Cancel** → the checkbox reverts to off and no sync happens (D6). A toast may
  explain that nothing changed.
- No records locally → no modal.

Implementation note: `onEnabledChange` in
`apps/desktop/src/components/sync/sync-settings.tsx` currently calls
`sync.update()` directly. It must instead open this modal and call `update` only
on confirm. The local count comes from the synced tables; the cloud count comes
from a `fetchSyncStatus` call, with a graceful fallback (show local count only) if
the server is unreachable.

### 6.4 The chooser (fixes P3)

Shown only when both sides have records and no strategy is remembered for the
current endpoint (D4, D7). Options (D15):

1. **This device's data** — local rows are authoritative:
   - Push local rows and tombstones to the cloud.
   - Pull, adding cloud rows for keys this device does **not** have, and
     **never overwriting an existing local row** with an incoming one.
   - No table is wiped.
2. **Use the cloud copy** — replace local with cloud (D8, D9):
   - Take an automatic local backup first (§6.5).
   - Clear the local synced tables.
   - Reset pull cursors, full pull, so the device mirrors the cloud exactly.
   - Records that exist only on this device are removed.
   - Push cursors are reconciled so nothing local is re-uploaded afterwards.
3. **Merge (newest wins)** — the current behaviour: push-then-pull with
   per-row last-write-wins (`runEnginePass`).

After a choice, persist the strategy **per endpoint** (D7, D14) so ordinary later
runs are silent. Changing the endpoint clears the decision for the new URL.

### 6.5 Safety net (D10, D16)

Before any "Use the cloud copy" action:

- Snapshot the synced tables using the existing backup pattern
  (`snapshotTable`/`pruneBackups` in
  `apps/desktop/src/features/inventory/creation/snapshot.ts`, as the import and
  vocabulary flows already use).
- Record the backup's timestamp and row count.
- Expose it in the Status tab ("Backup from <when> · N rows") with a
  **Restore this backup** action, and prune old backups with the same retention
  as the existing flows.

### 6.6 Status tab diagnostics (D2, D11, D17)

Extend the Status card in `sync-settings.tsx` to show, side by side:

- **This device** — row counts per synced table (via `countRows`) and units
  (`sumQty`) where applicable.
- **In the cloud** — the existing `/sync/status` counts and totals.
- A clear mismatch indicator when the two differ for a table (e.g. highlight the
  row, or annotate "0 here · 85 in the cloud").
- **Last run** — rows pushed, rows applied, rows skipped, conflicts resolved,
  taken from `SyncRunResult` (`pushedRows`, `pushedDeletes`, `appliedRows`,
  `appliedDeletes`, `skipped`, `conflicts`) which the provider already stores in
  `lastResult`.
- Keep the existing caption that units are summed `qty` and that the cloud
  numbers are the server's, and add one line clarifying which side is local.

### 6.7 "Why did nothing download?" explanation (D11, D17)

When a run applies 0 rows while the cloud holds more than the device, the Status
tab states a plain-language reason rather than showing a silent zero. At minimum:
"pull cursor is ahead of cloud data", "N rows skipped (missing parent / older
tombstone)", or "no pull performed this run". The exact strings can be refined in
implementation; the requirement is that a silent skip can never recur.

---

## 7. Edge cases

1. **Both sides empty** — idle, no prompt, no chooser.
2. **Empty device, populated cloud** — silent full pull (D13).
3. **Populated device, empty cloud** — push only; the toggle modal already warned.
4. **Server unreachable during "Check server"** — show an error, do not mutate
   anything; counts stay blank rather than showing a stale number as current.
5. **Server unreachable during the chooser count check** — fall back to local
   counts only and say the cloud count is unavailable.
6. **Operator picks "Use the cloud copy" while offline** — refuse, explain, and
   leave local data untouched.
7. **Interrupted "Use the cloud copy"** (crash mid-wipe/mid-pull) — the backup
   must make recovery possible; the flow should be resumable or at least
   restartable without data loss.
8. **Repointing to a new endpoint** — clears the remembered strategy; the new
   endpoint's overlap prompts again.
9. **Local edits made between enabling and the first run** — the chooser counts
   are read at run time, not at toggle time.
10. **A synced table is missing locally** (pre-migration DB) — treat as empty,
    do not crash; matches `isLocalEmpty`'s existing tolerance.
11. **Tombstones / deletes** — "records" for the decision table are rows; deletes
    follow the chosen strategy's rules (the cloud strategy mirrors the cloud and
    drops local-only rows; the local strategy pushes local tombstones).
12. **Same-row conflict (identical key, different content)** — resolved by the
    chosen strategy, never silently by whichever side happened to sync first.
13. **Both sides have records but the overlap is empty** (disjoint key sets) —
    still the "both" branch; the chooser appears once and is remembered.
14. **Roaming/one operator, many devices** — each device remembers its own
    strategy per endpoint; nothing is shared through the cloud.

---

## 8. Data & storage changes

- **Settings** (`apps/desktop/src/lib/sync/sync-settings.ts`, store file
  `sync.json`): add a per-endpoint strategy map, e.g.
  `endpointStrategies: Record<string, "local" | "cloud" | "merge">`, with a
  `coerce()` path that tolerates an older store file (no field → `{}`).
- **Local backup** — reuse the existing snapshot table pattern; no new migration
  is required for the backup itself if the pattern is followed. If a new sync
  metadata column/table is added, it must be a **new** migration file (never edit
  a shipped migration — see `AGENTS.md` and `docs/database-migrations.md`) and the
  new line added to `apps/desktop/src-tauri/migrations.lock`.
- **Cursors** — `sync_state` gains no new keys beyond what the reset/reconcile
  steps need; the strategy does not belong in `sync_state` because it is
  per-device configuration, not clinic data (matching the comment in
  `sync-settings.ts` about why settings live in the store).
- **Worker** — may add fields to `/sync/status` if the client needs them for the
  overlap check; the existing `counts`/`totals` fields are already sufficient for
  the decision table, so prefer no Worker change unless required (D12).

---

## 9. Root-cause confirmation for P1 (evidence required)

Before fixing, the implementer must capture evidence for which hypothesis in §1
applies, and record it in the PR/commit:

- Read the local `sync_state` cursors (`pull:*`, `push:*`) on the affected
  device and compare against the cloud's newest timestamps
  (`/sync/status` `lastWriteAt`).
- Reproduce with a device whose local synced tables are empty and a cloud holding
  rows: confirm the first connection pulls them (this is the acceptance test for
  §6.2).
- Reproduce a pull that skips rows (e.g. a child row whose parent is absent) and
  confirm `skipped` is now reported.
- Confirm that after the fix the Status tab's local count matches the cloud count
  for `inventory_items`, and Stock Management renders those rows.

This section exists because D11 chose "diagnose, then fix, plus guaranteed pull
and diagnostics": the fix must not be a guess.

---

## 10. Testing

### Unit

- Decision-table classification (four states in §6.1) — new pure helper,
  unit-tested against a fake DB (patterns in `apps/desktop/src/test/fake-db.ts`).
- `pullRemoteChanges`/`applyPullResponse` with the "local-preferred" strategy:
  incoming rows must not overwrite existing local rows.
- Cursor reset on endpoint change; strategy lookup per endpoint; clearing on
  repoint.
- Backup creation before "Use the cloud copy", and restore from it.
- Toggle-confirmation gating: `update()` is not called when the modal is
  cancelled.

### Component

- `sync-settings.tsx` Status card renders local and cloud counts side by side and
  the last-run applied/skipped line.
- The enable-confirmation modal shows the exact warning string with counts, and
  cancel leaves the checkbox off.
- The chooser renders the three labelled options only in the both-sides case.

### Integration

- Empty device + populated cloud → silent full pull (the P1 acceptance test).
- Both sides populated, no remembered strategy → chooser once, then silent.
- "Use the cloud copy" → local mirrors cloud, local-only rows gone, backup
  exists and restores.
- Worker `/sync/status` still returns counts for the side-by-side view.

### Manual

- Point a fresh install at a populated Worker and confirm Stock Management fills.
- Confirm the exact modal wording "Records already exist on this device. Are you
  sure you want to sync?" appears when enabling with local records.

Run the repo's checks before finishing: `pnpm dlx ultracite check`, the desktop
typecheck, and the sync/worker test suites.

---

## 11. Rollout

- No schema change is required for the core flow; if one is added it is a new
  migration plus a `migrations.lock` line, released together (never edit a
  shipped migration).
- Worker changes (if any) must be backward compatible so an older client keeps
  working; the client tolerates a `skipped` field being absent, as it already
  does.
- Existing installs keep their cursor state; only an endpoint change or an
  unknown strategy triggers the new first-pull path.

---

## 12. Open questions

1. Exact visual treatment of the side-by-side counts (single table vs two
   columns) and whether a mismatch should be a colour cue or text.
2. Whether the remembered strategy should be editable from the Status tab (a
   "change sync strategy" action) rather than only by repointing the endpoint.
3. Retention policy for the automatic backups (how many to keep, and whether they
   share the import-flow's prune limit).
4. Whether "This device's data" should also offer a dry-run/preview of how many
   conflicts it would win before committing.
5. Whether the count comparison should use rows, summed units, or both as the
   primary mismatch signal (units are already shown today).
6. Whether the toggle confirmation should ever be suppressed for operators who
   tick the box repeatedly in one session.

---

## 13. File map (where the work lands)

| Concern | File |
| --- | --- |
| Decision table, first pull, chooser wiring, strategy memory | `apps/desktop/src/lib/sync/use-sync.tsx` |
| Settings shape + per-endpoint strategies | `apps/desktop/src/lib/sync/sync-settings.ts` |
| Pull/apply with a `local` strategy; skip reporting | `apps/desktop/src/lib/sync/sync-client.ts`, `apps/desktop/src/lib/sync/changes.ts`, `apps/desktop/src/lib/sync/conflict-resolver.ts` |
| Cursor reset / reconcile | `apps/desktop/src/lib/sync/offline-queue.ts` |
| Local/cloud counts | `apps/desktop/src/lib/sync/scan.ts` (`countRows`), Worker `handleStatus` |
| Toggle modal, chooser UI, diagnostics, backup listing | `apps/desktop/src/components/sync/sync-settings.tsx` |
| Backup snapshot/restore pattern | `apps/desktop/src/features/inventory/creation/snapshot.ts` |
| Worker endpoints (only if needed) | `workers/sync/src/handler.ts`, `workers/sync/src/validate.ts` |
| Tests | colocated `*.test.ts` / `*.test.tsx` next to each module |
