# Backup Completeness Audit — is local backup fully implemented?

**Date:** 2026-09-30
**Scope:** every path by which data in this app can be lost, mapped against the
implemented backup/restore subsystem, then compared to primary-source guidance on
effective backup design.
**Method:** read the implementation (not the spec prose), verified every load-bearing
claim against the source, then researched primary sources (SQLite project docs, NIST,
CISA).

---

## Verdict

**The backup mechanism itself is genuinely well built. The coverage around it is not
complete.** Two claims in the app are actively untrue, and several real data-loss paths
are ungated. You cannot currently demonstrate that backup is "fully implemented", because
no test, no document, or no UI element verifies a backup was ever *restorable*.

| Question | Answer |
| --- | --- |
| Is a consistent copy taken safely? | **Yes** — `VACUUM INTO` + rename, correct per SQLite docs |
| Can it be verified before use? | **Yes at restore time only**; never verified after creation |
| Are all destructive actions gated? | **No** — purge, and ordinary Excel import, are not |
| Is there a copy off this machine, by default? | **No** — all copies live in `<Documents>` on the same disk |
| Do the tests cover the code that swaps the DB? | **No** — zero Rust tests for `backup.rs` |
| Is the "sync/offline" UI truthful? | **No** — it describes a queue that does not exist |
| Does CSV/JSON export work? | **No** — invokes a non-existent command, then reports success |

---

## Part 1 — What is actually implemented

### 1.1 The copy mechanism: correct

`apps/desktop/src-tauri/src/commands/backup.rs:166-210` (`create_backup`):

- `VACUUM INTO '<dest>.db.partial'` (`:201`)
- `rename` into place only on success (`:207`)
- refuses to overwrite (`:176`), refuses non-`.db` (`:171`)
- `busy_timeout` 10s (`:196`)

This is the right primitive. SQLite's own corruption guide lists `VACUUM INTO` first among
the three safe ways to copy a live database, and notes all of them "work even on a live
database" ([sqlite.org/howtocorrupt.html §1.2](https://www.sqlite.org/howtocorrupt.html)).
`VACUUM INTO` is transactional: the output "is a consistent snapshot of the original
database" ([sqlite.org/lang_vacuum.html](https://www.sqlite.org/lang_vacuum.html)).

Correctly avoided: a plain `fs::copy` of the live file, which per the same guide can
capture a torn page set and miss the `-journal`/`-wal` sidecar.

`.partial` sweep at every launch (`backup.rs:106-133`, called `src-tauri/src/lib.rs:131`)
is right, and matters: SQLite warns the `VACUUM INTO` output "might be incomplete and
corrupt" if interrupted by power loss.

### 1.2 Triggers: real, and the gates that exist

| Trigger | Location | Gates a destructive action? |
| --- | --- | --- |
| Daily auto, first launch per calendar day | `features/backup/hooks/use-daily-backup.ts:142-163` | — |
| "Back up now" | `features/backup/components/backup-tab.tsx:128` | — |
| "Save a copy…" (native picker, any folder) | `backup-tab.tsx:142-178` | — |
| Before **Wipe All Data** | `features/admin/settings/components/wipe-data-card.tsx:39-48` | ✅ backup failure blocks the wipe |
| Before **updater install** | `features/updater/use-updater.tsx:214-223` | ✅ backup failure blocks install |

The gating pattern (`writeSafetyBackupFile()` must resolve before the destructive call) is
the single most valuable thing in this subsystem, and it is applied in two places.

### 1.3 Restore: verified before the swap

`inspect_backup` (`backup.rs:291-459`) opens `mode=ro`, runs `PRAGMA integrity_check`,
checks `inventory_items` + `requests` exist, and refuses a schema version newer than the
app. Read-only on every path. `apply_restore` (`backup.rs:470-531`) copies to
`.restore-incoming`, deletes `-wal`/`-shm`, then renames over the live file. The Windows
rename-over-existing constraint is handled explicitly at `:503-510`. The restore journal
is single-use and deleted before parse (`backup.rs:579-581`) so a corrupt journal cannot
re-appear every launch.

This is above-average for a local-first app.

---

## Part 2 — Data-loss paths, ranked

### P0 — The app reports success for an operation that did nothing

`features/admin/data/components/export-card.tsx:109` invokes `"export_data"`. That command
is not registered. `src-tauri/src/lib.rs:110-122` registers only the nine `backup::*`
commands plus `save_stock_report_workbook` and `generate_stock_report_pdf`. The throw is
swallowed at `export-card.tsx:114-116`.

The only working path is the browser fallback, gated on `format === "xlsx" &&
selected.includes("inventory")` (`:119-123`). So:

- CSV export → no file, but `toast.success("Export ready — cmis-export-<date>.csv")` at `:220-224`
- JSON export → no file, same false toast
- Requests and Audit logs are offered **only** in those two broken formats
  (`features/admin/data/types.ts:18-24`)

An operator who exports their data, sees a green checkmark, and deletes their laptop has
lost it. This is the single worst defect in the file. Both project specs already record it
as a known finding, not a decision (`backup-restore-spec.md:37` B7,
`stock-report-export-spec.md:33` SX6).

### P0 — "Delete permanently" is not gated on a backup

`features/inventory/creation/trash/purge.ts:26-47` hard-`DELETE`s batches, dispensing
events, items, then the trash row. It is the only irreversible in-app action, and unlike
wipe and updater-install it takes **no** safety backup first. It is the exact operation the
`writeSafetyBackupFile()` gate exists to protect, and the gate is missing.

### P0 — The import confirmation makes a durability claim that is false

`features/admin/data/components/import-card.tsx:573`: *"The original database is backed up
first."*

The confirm handler (`:342-400`) takes no backup of any kind. `importInventoryCsv` rolls
back only via the in-DB snapshot tables (`features/inventory/creation/snapshot.ts`), which
"die with the database they live in" — the app's own words at
`features/admin/health/data/system-health.ts:78-81`. The only off-database protection is
the daily backup, which may be up to 24 hours stale. `docs/TODO.md:1` shows this was a
known open request.

### P1 — The "offline / sync" UI describes a queue that does not exist

| UI claim | Reality |
| --- | --- |
| "Offline — changes are queuing locally." (`admin/health/components/health-page.tsx:110`, `settings/components/health-tab.tsx:91`) | No queue. Nothing is buffered. |
| "Retry sync" button (`system-health.ts:220`) | `use-health.ts:98-112` clears an always-empty array and patches React state. Runs no code. |
| Pending-sync table with Record/Queued/Attempts columns (`health-page.tsx:113-146`) | Always renders the empty branch. Pure chrome. |
| `audit_log.branch`, `action: "sync"` (`migrations/0004:45,47`) | Vestigial. Every write is `branch: "local"` (`write-audit.ts:63`). |
| "View sync errors" (`health-page.tsx:147-156`) | Unreachable — depends on `pendingSyncs.some(e => e.error)`. |

This is not a durability defect: writes go straight to a local file, so there is no
network write to lose. The defect is **dishonesty** — and it matters for your question
specifically, because "offline queue" is exactly the feature an operator would assume
protects them. `navigator.onLine` is also unreliable and is used only to dim cards
(`use-health.ts:22-35`).

### P1 — Backups are not verified after creation

The 3-2-1-1-0 rule's "0" means zero errors, confirmed by verification, not assumed. NIST
frames it as determining the RPO and testing recovery; a backup that has never been
restored is "an assumption, not a control" and only tested restores confirm
recoverability. `create_backup` renames and returns. Nothing ever opens the new file to
confirm it is a valid database. `PRAGMA integrity_check` runs only at restore time — by
which point you have already lost the current data.

### P1 — Every copy is on the same physical disk

Backups go to `<Documents>/CMIS Backups` (`backup.rs:136-146`). `Documents` and the app
data directory are on the same drive on every normal machine. Disk failure, ransomware, or
laptop theft takes the primary **and** all ten retained auto copies.

The spec is honest about this — it rules out app data as the location because "a backup
that lives on the same disk, in the same folder as the thing it protects, is not a backup"
(`backup-restore-spec.md:20`) — then leaves it as open question Q2 (`:381`). CISA's and
NIST's guidance is unambiguous: keep 1 copy offsite; "3-2-1" without the offsite copy
leaves the dominant real-world failure mode uncovered.

"Save a copy…" (`backup-tab.tsx:142-178`) is the escape hatch and is well built — the
operator can put a copy on a USB stick or a synced cloud folder. But it is manual and
undocumented as the required practice. Nothing reminds the operator to do it, and nothing
checks that it was ever done.

### P1 — The code that swaps the user's database has zero tests

`backup.rs` is 588 lines and contains no `#[cfg(test)]`. The only Rust tests in the
project are in `commands/reports.rs:724-765`. So `create_backup`, `inspect_backup`,
`apply_restore`, `prune_backups`, `stage_import_db`, `consume_restore_journal`, and
`sweep_partial_files` are entirely untested.

Nine JS test files cover the pure logic around them, and one is genuinely good:
`features/backup/data/backup-roundtrip.test.ts` drives a real `node:sqlite`
`DatabaseSync`, runs `VACUUM INTO`, and asserts rows survive plus `integrity_check = ok`.
That proves the *engine* is right. It does not prove the *file swap* is right.

The spec mandates a negative test that does not exist (`backup-restore-spec.md:324`):
truncate a file, assert inspection refuses it, and assert the live database is
byte-identical afterwards. That is precisely the test that would catch a bad swap. There is
no e2e suite at all — no Playwright, Cypress, or Webdriver in the project.

### P2 — No way to undo a bad write

Restore is whole-file and all-or-nothing (declined as N4/N10). There is no revision column,
no MVCC, no point-in-time recovery, no per-record undo. The 5-second quick-deduct undo
(`use-quick-deduct.ts:52`) dies with the process. Audit corrections append a new row
(`use-audit-correction.ts:28-58`); nothing reads them back to mutate data.

Realistic loss: a wrong stock-out on the 3rd, discovered on the 9th. The only remedy is
restoring a whole `.db` from the 2nd, which also reverts six days of correct work.

### P2 — Unbounded growth in Trash and the audit log

Nothing is ever purged automatically (`features/inventory/components/trash-list.tsx:13`),
and the audit log is never pruned or rotated — only cleared by Wipe All Data. Not data
loss, but it makes every backup monotonically larger and every `VACUUM INTO` slower, which
erodes the reliability of the copy over time.

### P2 — Two app settings are outside the backup

`cmis-backup.json` (the backup policy itself) and `updater.json` live in the Tauri store,
not the database. Restoring a backup does not restore the retention policy. Minor, but it
means a restored install silently reverts to the default keep-10.

---

## Part 3 — Cross-check against primary sources

| Source | Guidance | This project |
| --- | --- | --- |
| [SQLite: How To Corrupt An SQLite Database File](https://www.sqlite.org/howtocorrupt.html) §1.2 | `VACUUM INTO`, the backup API, and `sqlite3_rsync` are the three safe live-copy approaches; a plain file copy may capture a torn page set and miss the journal | ✅ `VACUUM INTO` |
| [SQLite: VACUUM](https://www.sqlite.org/lang_vacuum.html) | Output is a consistent snapshot; an interrupted run "might be incomplete and corrupt" | ✅ `.partial` + launch sweep |
| [SQLite: same, §3](https://www.sqlite.org/howtocorrupt.html) | Run with default `synchronous=FULL`; use WAL mode where possible | Default is FULL; no `journal_mode` pragma is set, so it stays in rollback-journal mode — acceptable, and WAL would change nothing here |
| [NIST SP 800-34 / MSP ransomware guide](https://www.nccoe.nist.gov/sites/default/files/legacy-files/msp-protecting-data-extended.pdf) | 3 copies, 2 media, 1 offsite; define RPO and RTO | 1 copy, 1 disk. No RPO/RTO stated anywhere |
| [CISA: Data Backup Options](https://www.cisa.gov/sites/default/files/publications/data_backup_options.pdf) | "Saving just one backup file may not be enough" | 10 files, all same disk |
| 3-2-1-1-0 (AvePoint, SentinelOne) | Add one offline/immutable copy; the "0" is zero errors **confirmed by automated verification** | No immutability, no post-creation verification |
| [Local-First Software (Kleppmann/Ingram/Kleppmann)](https://martin.kleppmann.com/papers/local-first.pdf) | With data ownership comes the responsibility to maintain backups; off-device copy is what survives disk failure | "Save a copy…" exists but is undocumented as mandatory |

Note on the `VACUUM INTO` / WAL caveat: `VACUUM INTO` does not carry the source's
`journal_mode=WAL` into the output ([SQLite forum](https://sqlite.org/forum/forumpost/8f98e0d81b)).
This project does not use WAL, so there is no impact — but it would matter if WAL were
ever adopted.

---

## Part 3.5 — Fixed in this pass

Done TDD-first (each test written, watched fail, then implemented):

| Fix | Files |
| --- | --- |
| **Export never reports a file that was not written.** New `export-outcome.ts` decides the toast from what actually happened; CSV/JSON are disabled with "not available yet" instead of silently producing nothing. The `streams in chunks` claim is gone. | `admin/data/export-outcome.ts` (+test), `components/export-card.tsx` |
| **Purge is gated on a safety backup.** New shared `runWithSafetyBackup` writes a `cmis-manual-*` copy first and refuses the purge if it fails. | `backup/data/safety-gate.ts` (+test), `inventory/hooks/use-inventory-deletion.ts` (+test) |
| **The import confirmation is now true.** The import takes the same gate, so "The original database is backed up first" is no longer a lie. | `admin/data/components/import-card.tsx` (+test) |
| **The fictional sync UI is gone, and health actions now run real SQL.** "Integrity check passed" used to print without asking SQLite anything; "Vacuum" without running VACUUM; "Retry sync" cleared an always-empty array. All now execute for real and report failures honestly. The pending-sync table, the offline "changes are queuing locally" banner, and the unreachable "View sync errors" button are removed. | `admin/health/data/health-actions.ts` (+test), `hooks/use-health.ts`, `data/system-health.ts`, `components/health-page.tsx`, `settings/components/health-tab.tsx` |

The purge and import gates are the two that retire real data loss: both are
irreversible or overwrite-wide, and both previously proceeded with no
off-database copy.

### Not yet done
- Post-write `PRAGMA integrity_check` on every backup (the "0 errors" in 3-2-1-1-0).
- Rust tests for `backup.rs`, including the spec's mandated negative test.
- Off-disk copy guidance and a disaster-recovery runbook.
- Retention for Trash and the audit log.
- The re-importable detailed XLSX backup (`docs/TODO.md:1`).

## Part 4 — What "fully implemented" would require

Ordered by risk retired per unit of work.

**1. Fix the false success in Export.** Either implement `export_data` in Rust, or refuse
CSV/JSON in the UI with an honest message. Never show a success toast for a file that was
not written. *(P0, small)*

**2. Gate purge on a safety backup.** Reuse the existing `writeSafetyBackupFile()` pattern
from `wipe-data-card.tsx:39-48`. *(P0, small)*

**3. Fix or remove the import confirmation's false claim**, and gate the import on a real
backup. *(P0, small)*

**4. Delete the sync UI, or build the queue.** Do not ship a "changes are queuing locally"
message over an empty array. *(P1, small to remove)*

**5. Add Rust tests for `backup.rs`.** At minimum the spec's mandated negative test
(truncated file refused, live DB byte-identical), plus `apply_restore` failure leaves the
live DB intact, and `.partial` never renamed on failure. `sqlx` against a temp file is
enough — no Tauri harness needed for the file-swap logic. *(P1, medium)*

**6. Verify each backup right after writing it.** Open the new file, `PRAGMA
integrity_check`, and record the result in the audit log. This is the "0 errors" in
3-2-1-1-0 and turns the whole subsystem from "assumed working" to "verified". *(P1,
small)*

**7. Make off-disk copies the documented default.** Do not add cloud — the local-only
constraint (N3) is sound for a clinic with sensitive stock data. Instead: at first run,
ask once where the second copy should go, and surface a persistent reminder until a
`cmis-manual-*` file exists outside the default folder. Cheapest honest version: a line in
`docs/privacy.md` and the in-app Backup help saying plainly that the default folder is the
same disk. *(P1, medium)*

**8. Write the disaster-recovery runbook.** Disk died / app uninstalled / database corrupt /
reinstall on a new machine. There is no such document. The first-run restore prompt
(`first-run-restore-prompt.tsx`) is good and undocumented. *(P1, small)*

**9. Decide on the detailed re-importable XLSX backup** — the author's own open request at
`docs/TODO.md:1`, deferred as D12/N2. This is the one that protects against *schema*
problems: a `.db` from an older build may restore cleanly and still be wrong for the
current app. *(P2)*

**10. Retention for Trash and audit log.** Bounds backup size and copy time. *(P2)*

---

## What is genuinely done well

Worth stating plainly, because most of the list above is criticism:

- The copy primitive is the correct one, chosen for the right reason, and the reason is
  written down in the code (`backup.rs:158-164`).
- `.partial` + rename + launch sweep handles the interrupted-copy case properly.
- Inspection is read-only, runs `integrity_check`, and refuses on four distinct grounds
  with a human sentence for each.
- Destructive actions are gated on a successful backup — in two of the four places that
  need it.
- Retention only ever deletes `cmis-auto-*` files. Manual copies and foreign files are
  structurally ineligible (`backup.rs:240-283`), so pruning cannot destroy something the
  operator meant to keep.
- Backup failure is loud and persistent: a banner with no close button, cleared only by
  success, plus a persisted error retried next launch.
- The spec is honest about its own compromises and records what it declined and why.

The gap is not craft in the mechanism. It is coverage around it, and two places where the
UI asserts things the code does not do.
