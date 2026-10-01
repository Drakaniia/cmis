# Database Migration Rules

Migrations live in `apps/desktop/src-tauri/migrations/` and are applied by
[`tauri-plugin-sql`](https://crates.io/crates/tauri-plugin-sql) at startup. **Once a
migration has shipped in a release, its file must never change again.**

## The rule

| Action | Allowed |
|--------|---------|
| Adding a new `NNNN_name.sql` | Yes, always |
| Changing or deleting a migration that has shipped | **Never** |
| Correcting a migration that shipped broken | Only by changing the file *and* its `migrations.lock` line in the same commit |

## Why

`tauri-plugin-sql` stores a checksum in the `_sqlx_migrations` table for every
migration it applies. On the next launch it compares each recorded checksum against
the bytes compiled into the binary, and **panics** if they differ:

```
thread 'main' panicked at src/lib.rs:167:10:
error while running tauri application:
  PluginInitialization("sql", "migration 13 was previously applied but has been modified")
```

The checksum covers the whole file, so **editing a comment is enough to trigger it**.

The failure is total and silent: exit code `101`, no window, no toast. Nothing is
written to a log file in release builds, because `tauri-plugin-log` is only registered
under `cfg!(debug_assertions)` (`src-tauri/src/lib.rs:144`). The desktop shortcut
still works, so it looks like the installer is broken.

This has no relation to the installer. The break is inside the compiled binary, so
`MSI`, `NSIS .exe` and portable installs all fail identically. Reinstalling or
re-running the installer will not help.

## What happened in 1.9.1

Release 1.9.0 shipped `0013_vocabulary_terms.sql`. Commit `1df8f2f`, titled
`docs: name the surviving vocabulary source after the scripts were deleted`,
rewrote three lines of SQL **comment** in that file to reference a renamed Python
script. The comment change rode along with a documentation commit, so nothing in the
diff looked like a schema change.

1.9.1 compiled those new bytes. Every install that had already applied migration 13
- that is, every install updating from 1.9.0 or earlier - then refused to start. The
release bricked its own users with a `docs:` commit. 1.9.2 reverted the file to the
exact bytes 1.9.0 shipped.

## Doing it right

**Adding a migration** needs no bookkeeping. Create the next numbered file and it is
unlocked until you tag a release:

```
apps/desktop/src-tauri/migrations/0014_some_change.sql
```

When you tag a release, append a line to `apps/desktop/src-tauri/migrations.lock`:

```
0014_some_change.sql <sha256 of the file's bytes>
```

That is what makes a migration "published" and puts it under the guard below. Compute
the hash from the file as committed (`git ls-files --eol` should report `w/lf`), not
from a copy you edited elsewhere.

**Never** squash, reword or amend a published migration to keep history tidy. Add
`0015_...` instead.

## Correcting a migration that shipped broken

The normal answer is a new migration. The one exception is when the shipped migration
never actually ran anywhere - for example 1.9.1, which panicked before it could apply
anything, so no database ever recorded its checksum. In that case reverting the file is
safe, and it is the only way existing installs recover.

Reverting is a deliberate, reviewed act:

1. `git checkout <last-good-release> -- <migration>.sql`
2. Update that migration's line in `migrations.lock` in the same commit
3. Say so in the commit body, so the reviewer sees a published file changing on purpose

If a database *did* record the bad checksum, reverting will not help it - that install
needs the corrected checksum written to `_sqlx_migrations`, or a restore from backup.

## Enforcement

The `published-migrations` job in `.github/workflows/ci.yml` hashes every migration
named in `migrations.lock` and fails the build if the bytes differ, or if a locked file
has gone missing. It runs on every push and pull request to `main`, so a bad edit
cannot reach a tag.

`.gitattributes` pins `*.sql` and `*.lock` to `eol=lf`. Keep it that way: a checksum
over CRLF bytes differs from the same file checked out with LF, which would fail the
build on Windows and pass on CI. The guard also strips `\r` when reading the lock, so a
stray CRLF cannot silently produce a false pass the way it did while this was first
written.

## Diagnosing a build that will not start

```powershell
$p = Start-Process "C:\Users\<you>\AppData\Local\cmis\app.exe" -PassThru `
     -RedirectStandardError "$env:TEMP\cmis-err.txt" -NoNewWindow
$p.WaitForExit(30000); Get-Content "$env:TEMP\cmis-err.txt"
```

Release builds are GUI-subsystem, so nothing reaches a console on a normal launch.
Redirecting stderr is currently the only way to read the panic. Exit code `101` is a
Rust panic; the message names the plugin and the migration.

The live database is at `%APPDATA%\com.cmis.app\cmis.db`, and the app writes backups
to `Documents\CMIS Backups\` before it installs an update.

## Recovering an install that is already bricked

In order of preference, data intact in every case:

1. **Install the last release that worked** (download its installer from GitHub
   Releases and run it). The database matches that version, so it opens.
2. **Fix the recorded checksum.** Inspect what the binary expects against what the
   database holds:
   ```powershell
   sqlite3 "$env:APPDATA\com.cmis.app\cmis.db" "SELECT version, success, hex(checksum) FROM _sqlx_migrations ORDER BY version;"
   ```
   Only do this when you know the shipped migration never ran.
3. **Restore a backup** from `Documents\CMIS Backups\`. The most recent is written
   automatically before each update installs.

Never delete `cmis.db` to get a working app - that discards the clinic's inventory.