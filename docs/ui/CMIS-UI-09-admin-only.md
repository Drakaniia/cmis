# CMIS UI/UX Spec — 09 Admin-Only Screens

Spec ID: CMIS-UI-09 | Routes: `/admin/users` · `/admin/settings` · `/admin/audit` · `/admin/data` · `/admin/health` | Depends on: 00, 02, 06

> Five screens gated to Admin. Each is a focused tool, not a dashboard — Simplicity: one purpose per screen, advanced options one level deeper (§16). All share the shell conventions (00) and hybrid split/sheet patterns (02).

---

## 1. User Management (`/admin/users`)

### 1.1 Purpose

Create, edit, deactivate accounts and assign roles/branches — access control with audit consequences.

### 1.2 Layout Options & Recommendation

| Option                                               | Structure                                                                                                                                                                     | Trade-offs                                                                                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Table + detail panel (spec 3.7.1 multi-panel)** | Filterable table + hybrid detail (panel ≥1200 / sheet <1200) — mirrors Inventory pattern (02)                                                                                 | + Familiar; scan + inspect without navigation; reuses split component. − Feels heavy for ~dozens of users                                                |
| **B. Full table + modal edit**                       | Table owns width; click row → edit in modal                                                                                                                                   | + Maximum scan width; edit is modal task (like Stock wizards). − Extra click to see detail before editing                                                |
| **C. Table + side sheet detail (RECOMMENDED)**       | **A where detail matters** (view user) but **edit is modal** — detail sheet is read-only audit/branch view; "Edit" button inside sheet opens the same modal as "Create user". | + Division of labor: read = sheet (parallel context), write = modal with dim scrim (focused task per §12). Reuses both patterns without mixing concerns. |

**Chosen layout:**

```
≥1200:  ┌──────────────────────┬─────────────────────────┐
        │ Table: Name/Email/Role/Branch/Status/LastLogin│  Detail sheet (panel): branch assignment, activity spark
        └──────────────────────┴─────────────────────────┘
<1200:  Table 100% → sheet from row origin
```

### 1.3 Table Columns

| Column     | Notes                                                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name       | Primary, weight 600                                                                                                                                                                     |
| Email      | `caption` muted under name on narrow                                                                                                                                                    |
| Role       | Editable badge `Admin/Staff/Viewer` — click badge → inline `DropdownMenu` role switch with confirm "Change [user] to [role]?" (destructive when demoting Admin). `aria-label` on badge. |
| Branch     | Assigned branch; Admin-only: "All branches" for Admin role                                                                                                                              |
| Status     | `Active` (green) / `Inactive` (gray) — toggle is `Switch` style, confirm on deactivation "Deactivate [user]? They will be unable to log in."                                            |
| Last Login | Relative time + absolute tooltip                                                                                                                                                        |

### 1.4 Actions

- **Header:** `[Create User]` primary → modal wizard (3 steps: Identity: name/email/password; Role: radio Admin/Staff/Viewer; Branch: selector). Inline validation per field; email uniqueness check live.
- **Row:** `⋯` menu: Edit (modal), Deactivate/Activate, Reset password (modal confirm), View audit for this user → filtered Audit Logs.
- **Bulk:** checkbox + "Deactivate selected" (confirm listing users) — useful for batch branch moves.

### 1.5 Detail Content

Read-only sheet: avatar/name, email, role history timeline (audit-sourced), branch assignment, "X actions last 7 days" mini histogram (same as Reports spark), linked Audit filter button.

---

## 2. System Settings (`/admin/settings`)

### 2.1 Purpose

System-wide configuration — branches, alert thresholds, suppliers, categories, backup. Change here affects all roles immediately — confirmation and audit are critical (Responsibility).

### 2.2 Layout Options & Recommendation

| Option                                                     | Structure                                                                                                                                                                                   | Trade-offs                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **A. Tabbed settings page (spec 3.7.2 tabs)**              | Horizontal tabs: General / Branches / Alert Thresholds / Suppliers / Categories / Backup — tab content is form + table per domain                                                           | + One page, clear IA, tabs are wayfinding "Where am I?". − At 800px, 6 tabs crowd                                    |
| **B. Sidebar sub-nav**                                     | Vertical sub-nav inside content area (like spec sidebar but scoped)                                                                                                                         | + More room for tab labels. − Competing sidebar (nested nav confusion)                                               |
| **C. Tabbed with overflow + sticky tab bar (RECOMMENDED)** | **A +:** tab bar is **sticky under header** (translucent stacked layer) with horizontal scroll + snap + rubber-band edges (§9) at 800px. Active tab underline springs `1.0/0.30` on switch. | + Keeps tab metaphor without narrow-window clash; reuses board H-scroll pattern (05) for tab overflow — Familiarity. |

### 2.3 Per-Tab Content

| Tab                  | Content                                                                                                                                                                                                                                     | Component notes                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **General**          | App name (read-only in Tauri), default branch `DropdownMenu`, date/time format toggle                                                                                                                                                       | Simple form, Save toast "Settings saved"                                                |
| **Branches**         | Table: Name / Location / Status + `[Add Branch]` modal (name, location, active toggle) + row Edit/Delete (Delete blocked if stock exists — error "Move or dispose stock first")                                                             | Delete is destructive, requires typing branch name to confirm (forgiveness high-stakes) |
| **Alert Thresholds** | Global defaults + per-item overrides: `Expiry window: 30/60/90 days` radio + Low-stock global threshold number input; below: searchable table of per-item thresholds with inline edit (same popover as 04 §3.1). "Reset to global" per row. | Threshold chips show override vs global (accent when overridden)                        |
| **Suppliers**        | Table: Name / Contact / Lead time + CRUD modal                                                                                                                                                                                              | Searchable                                                                              |
| **Categories**       | Table: Name / Item count + CRUD modal; delete blocked if items exist                                                                                                                                                                        | —                                                                                       |
| **Backup**           | Card: last backup timestamp + location path + `[Trigger Backup Now]` + auto-schedule toggle (daily/weekly) + restore entry (links to `/admin/data` Import)                                                                                  | Backup is Tauri filesystem — show path `appData` per Tauri convention                   |

**Settings persistence:** `tauri-plugin-store` + SQLite config table; audit log "Settings changed: [section] by [Admin]" per save.

### 2.4 Motion

Tab switch: active underline springs, content cross-fades 150ms (no slide — tabs are not spatial travel). Input validation inline per §16.

---

## 3. Audit Logs (`/admin/audit`)

### 3.1 Purpose

Complete activity history for compliance — every state change, user action, settings tweak, and sync conflict.

### 3.2 Layout Options & Recommendation

| Option                                          | Structure                                                                                                                                                                                                                                                                                  | Trade-offs                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Filterable searchable table (spec 3.7.3)** | Columns: Timestamp / User / Action / Details / Branch; filters date/user/action/branch; free-text search over details                                                                                                                                                                      | + Audit reviewers expect tables; sortable time is natural. − Flat table hides correlation (e.g., which stock-in caused which dispense)                               |
| **B. Timeline + table hybrid**                  | Timeline left, table right                                                                                                                                                                                                                                                                 | + Correlation visible. − Adds chrome that doesn't help targeted search ("who changed threshold last Tuesday?")                                                       |
| **C. Table with expandable rows (RECOMMENDED)** | **A + expandable row:** click row → inline expanded card below row showing full diff (before/after JSON), request link where applicable, and "View correction" if amended. No modal — expansion keeps scan context (parallel, not focused task → no dim scrim, §12 separate to keep flow). | + Keeps table scan + one-click diff without losing position; reuses inventory row-expand affordance but inline, not sheet — audit review is _scanning_, not tasking. |

**Chosen columns:**

| Column    | Notes                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| Timestamp | `MMM DD, h:mm:ss A` — seconds matter for audit; sortable desc default                                                      |
| User      | Who performed (≈ Staff/Admin identity)                                                                                     |
| Action    | Badge: Stock In/Out, Request transition, Dispense, User Create, Settings Change, Sync — colored by category (`chart-1..5`) |
| Details   | Truncated brief ("Paracetamol +120 via B-2026-04") + expand caret `›`; full text in expanded card                          |
| Branch    | Affected branch                                                                                                            |

### 3.3 Filters

| Control     | Type                                               |
| ----------- | -------------------------------------------------- |
| Date range  | Presets 7/30/90/All + custom                       |
| User        | Searchable `DropdownMenu`                          |
| Action type | Multi-select `DropdownMenu` (checkbox list inside) |
| Branch      | `DropdownMenu`                                     |
| Search      | Free-text across Details + User + Action           |

Active chips + URL persistence. Row expand preserves filter scroll position (no jump).

### 3.4 Correction Flow (Admin Override)

Immutability note from 06 applies here too. To correct a past log: `⋯` → "Create correction" → modal with original values (read-only) + corrected values (`Input`) + reason `Textarea` required → creates new audit row linking to original ("Correction of [#id] by [Admin]: [reason]") — never overwrites original (Responsibility: audit is append-only).

### 3.5 Export

`[Export CSV]` — exports filtered view; paginates if >10k rows (Tauri streaming to file).

---

## 4. Data Export/Import (`/admin/data`)

### 4.1 Purpose

Backup/restore and bulk move — two cards (spec 3.7.4).

### 4.2 Layout Options & Recommendation

| Option                                              | Structure                                                                                                                                                     | Trade-offs                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **A. Two-card page (spec original)**                | Card 1: Export — select data type (Inventory/Requests/Logs/All) + format (CSV/JSON) + Download. Card 2: Import — dropzone + preview diff + confirm            | + Simple, one-purpose cards, clear hierarchy. − At 800px, cards side-by-side cramp                       |
| **B. Tabbed: Export                                 | Import**                                                                                                                                                      | + Focus per task. − User landing from Backup settings expects immediate import affordance — tab hides it |
| **C. Stacked cards, responsive grid (RECOMMENDED)** | **A but responsive:** `grid 2-col ≥900` / `1-col ≥800` stacked. Export card top, Import below on narrow. Each card is `Card` with branded heading accent bar. | + Keeps two-card clarity + narrow-window grace without tab indirection                                   |

### 4.3 Card Behaviors

**Export card:**

- Checkboxes for data type (multi-select, default All). Radio for CSV/JSON. Big `[Download]` primary — triggers Tauri `save` dialog (native file picker). Progress bar for large exports (streaming rows). Toast "Export saved to [path]".

**Import card:**

- `ImportDropzone`: drag-and-drop zone + `[Browse files]` button (uses `Attachment` component). Accepts `.csv` / `.json` / `.db` (backup). On file: parse + **preview diff** table (inserts/updates/deletes counts per type, first 5 rows diff) + warnings ("Import will overwrite 120 inventory rows"). Confirm is destructive-style with type-name-to-confirm ("Type 'IMPORT' to confirm"). On confirm: progress bar + toast + audit log "Data imported by [Admin] from [file] at [time]".

**Safety:** Import diff never commits until explicit confirm; preview query is read-only transaction rolled back.

### 4.4 Motion

Dropzone drag-over: `scale 1.01` + dashed border highlight `damping 1.0/0.25`. Preview table cross-fades. No bounce — this is a high-stakes destructive zone (Utility: reserve bounce for momentum; keep this chrome critically damped).

---

## 5. System Health (`/admin/health`)

### 5.1 Purpose

Monitor DB, storage, sync, backup, performance — at-a-glance operational health for Admin triage (complements Home's system health card with deeper metrics).

### 5.2 Layout Options & Recommendation

| Option                                                 | Structure                                                                                                                                                                                                                     | Trade-offs                                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **A. Status cards grid (spec 3.7.5)**                  | 5 cards: Database / Storage / Sync / Backup / Performance — each card metric + indicator                                                                                                                                      | + Glanceable cards match Home stat card language — Familiarity. − No history (is storage trending to full?) |
| **B. Cards + sparklines per card**                     | Each card gets 24px sparkline (DB query time, disk free over 7 days, sync pending counts)                                                                                                                                     | + Adds trend without extra page; consistent with Home stat cards.                                           |
| **C. Grid + sparkline + inline actions (RECOMMENDED)** | **B +:** each card has an action row: DB → [Vacuum] / [Integrity Check]; Storage → [Clear cache]; Sync → [Retry sync] / [View conflicts]; Backup → [Trigger backup now]; Performance → [View audit filtered to slow queries]. | + Makes health _actionable_ (Agency), not just informational.                                               |

**Chosen grid:**

```
 2-col at ≥900 (card height ~140px)
┌────────────────────┬────────────────────┐
│ Database           │ Storage            │  status dot green/amber/red + sparkline
│ ● Connected        │ ● 2.1 GB / 8 GB    │
│ size, last query   │ free, usage bar    │  [Vacuum]
├────────────────────┼────────────────────┤
│ Sync               │ Backup             │
│ ● Synced           │ ● Last: Sep 11     │
│ pending 3          │ Next: daily 02:00  │  [Retry]
├────────────────────┴────────────────────┤
│ Performance — query p50/p95, cache hit  │  [View slow queries] → Audit filtered
└─────────────────────────────────────────┘
 Compact: single col. Comfortable: 2 col except performance full-width.
```

### 5.3 Health Card Anatomy

| Element    | Token                                                              |
| ---------- | ------------------------------------------------------------------ |
| Title      | `heading` weight 600 + status dot (8px green/amber/red) left       |
| Value      | `display` 1.5rem for primary metric                                |
| Sparkline  | 24px `muted` stroke, `chart-1` fill 0.12 opacity                   |
| Action row | `Button ghost` sized `sm` — not primary (diagnostic, not frequent) |

### 5.4 Offline Interaction

Offline dot in header already present (00 §2.4). Health's Sync card is the _detailed_ view: lists pending syncs table (3 rows) + sync errors with "View" → Audit filtered to Sync actions. Offline status dims non-Sync cards to `opacity 0.7` with caption "Local cache" (like Reports).

---

## 6. Cross-Cutting — Palette & Sidebar

**Palette entries for Admin routes:**

| Query                                               | Target                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| "users", "manage users", "create user"              | `/admin/users` + focus name field                                  |
| "settings branches/thresholds/suppliers"            | `/admin/settings` with tab pre-selected via URL hash `#thresholds` |
| "audit logs", "audit [action]", "history of [user]" | `/admin/audit` with filters pre-applied                            |
| "export", "import", "backup"                        | `/admin/data`                                                      |
| "health", "database", "sync status"                 | `/admin/health`                                                    |

**Sidebar under command-palette dominance (00 §2.2):** Admin sidebar groups remain (Overview / Inventory / Requests / Reports / Administration) but palette provides _jump_ — sidebar is browsing, palette is doing. No duplicate "Health" vs "System Health" confusion: Home's health card links to `/admin/health`.

---

## 7. What These Screens Contain (Checklist)

- [ ] **Users:** table (Name/Email/Role badge/Branch/Status toggle/Last Login) + hybrid detail sheet + Create/Edit/Deactivate/Reset modals + inline role/badge switch + bulk deactivate
- [ ] **Settings:** sticky tab bar (6 tabs) with horizontal snap+rubber-band, per-tab forms/tables, threshold per-item override table, branch delete guard (confirm by typing), backup trigger + schedule
- [ ] **Audit:** filterable table (Timestamp/User/Action/Details/Branch) with expandable diff rows, multi-select action-type filter, append-only correction modal, CSV export with streaming
- [ ] **Data:** 2-card page (Export type+format+Tauri save dialog vs Import dropzone+preview diff+typed confirm), responsive grid, progress + toast + audit
- [ ] **Health:** 5-card grid with status dots + sparklines + action row per card, offline dimming, deep links to Audit
- [ ] All respect density toggle, reduced-motion/transparency, focus + `aria-label` on status, `Skip to content`
- [ ] Palette aliases per §6, sidebar badge parity, deep-link hash for settings tabs

---

## 8. Trade-offs Summary

| Screen   | Key decision                          | Why                                                                                    | Sacrifice                                                                                       |
| -------- | ------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Users    | Read = sheet, write = modal split     | Read is scanning, write is focused task — §12 Dim vs flow distinction                  | Two chrome patterns for one route — justified: frequency split (read far more than write)       |
| Settings | Sticky tab bar with H-scroll at 800   | Wayfinding without nested sidebar; reuses board scroll physics                         | 6 tabs crowd at 800 — snap+suggest via rubber-band + palette hash jumps mitigate                |
| Audit    | Expandable rows (not modal)           | Audit review is scanning — losing position hurts more than losing focus helps          | Inline expansion adds vertical jump — animation is cross-fade, not slide, to avoid layout churn |
| Data     | Stacked cards vs tabs                 | Two co-equal tasks — tabs hide the secondary task (Backup deep-link must land visible) | Stack consumes more vertical scroll — correct: these are infrequent, safety-critical pages      |
| Health   | Actionable cards vs read-only metrics | Health without action is a report, not a tool — Agency: let Admin _do_ something       | Actions are diagnostic (rare) so ghost buttons reduce accidental clicks vs primary              |
