# Settings & Inventory UX Fixes — Wipe Data, Suppliers, Apple Date/Quantity, Admin Tabs — Design

**Status:** Approved — ready for plan  
**Date:** 2026-09-16  
**Origin:** `docs/spec/settings-inventory-ux-fixes-spec.md` + brainstorm 2026-09-16 overrides  
**Scope:** `apps/desktop/src` only; no template/backend schema migration

## 1. Summary

Seven tightly-coupled UX/data fixes, delivered in phases:

| # | Area | Target |
|---|------|--------|
| 1 | **Wipe All Data** | Danger Zone in Settings → Data. `ConfirmModal` with `typeToConfirm="WIPE"` + Copy button + gated delete. Maximal by default (reset settings checked). |
| 2 | **Suppliers in Stock-In Wizard** | Dynamic `useSettings().state.suppliers`, optional, never blocks `Next`/`Confirm`; placeholder `Select supplier (optional)` |
| 3 | **Apple Date Selector** | Shared `AppleDatePicker` (popover calendar + wheel fallback), replaces 3× `type="date"` |
| 4 | **Quantity Stepper** | Shared `QuantityStepper` horizontal `[-][input][+]`, hold-to-repeat, replaces 6× `type="number"` |
| 5 | **Empty-state box** | No `border`/`bg-muted/20` when `!hasFilters`; plain centered text only |
| 6 | **"You're on the latest version" toast** | `checkNow({ silent:false })` from both Settings → Updates and Help (header `help-menu` + menubar); dev mock toast |
| 7 | **Icon background/color** | Remove `bg-*` wash, `text-muted-foreground/60`, matching `dashboard-metric-card` |

All values from clarification 2026-09-16 are locked in §2.

## 2. Locked decisions (overrides vs draft spec)

| # | Question | Decision (locked) |
|---|----------|-------------------|
| 1 | Wipe scope | `DELETE FROM dispensing_events; DELETE FROM request_queue; DELETE FROM inventory_items; VACUUM` + enumerate `cmis-*` localStorage keys + `LazyStore("updater.json")` `lastCheckedAt` reset. Optional checkbox **"Also reset suppliers, categories, and settings" default CHECKED** (maximal wipe). Uncheck keeps settings. |
| 2 | Wipe confirm word | `WIPE` (uppercase, 4 chars) with Copy button, `typed.trim() === "WIPE"` gating, `variant="destructive"` |
| 3 | Wipe placement | `features/admin/settings/components/data-tab.tsx:15` — `WipeDataCard` full-width Danger Zone above `ExportCard`/`ImportCard` grid |
| 4 | Supplier optionality | Nullable `supplier: string | null` in `StockInDraft`/`StockInPayload`; DB keeps `TEXT` ("" or NULL both mean no supplier); `validateStep(3):62` removes `supplier.trim()` clause; UI `Supplier (optional)` label + empty `value=""` placeholder |
| 5 | Supplier source | Dynamic `useSettings().state.suppliers` not `SUPPLIER_LEAD_TIMES`; lead-times kept for domain only |
| 6 | Empty supplier list | Single disabled option `No suppliers — add in Settings → Suppliers` |
| 7 | Unit fate | **Keep temporary unit dropdown sourced from Settings** until strength spec Phase 2 (not deleted now); remove 5 literals `tablet`/`capsule`/`bottle`/`sachet`/`strip` (`stock-in-wizard.tsx:267,482`) |
| 8 | Category default | `INVENTORY_CATEGORIES[0]` preselect removed → `""` + placeholder `Select category`; `validateStep(2)` requires `category.trim()` |
| 9 | Date picker scope | All 3 locations in one pass via shared component |
| 10 | Date picker location | `features/shared/components/apple-date-picker.tsx` (user override: not `packages/ui`) |
| 11 | Date picker design | Popover calendar grid (Apple §12 `surface-frosted backdrop-blur-xl`) primary; wheel fallback <640px |
| 12 | Quantity stepper scope | All `type="number"` sites via shared `QuantityStepper`; wizard first, then thresholds/reorder/dispose |
| 13 | Stepper layout | **Horizontal `[-][input][+]`** (user override) with `InputGroup` + `InputGroupButton` |
| 14 | Stepper behavior | step 1, min/max enforced, hold 400ms→80ms→50ms acceleration, wheel disabled, `ArrowUp/Down` ±1, `PageUp/Down` ±10, `Home/End` → min/max, clamp on blur |
| 15 | Empty-state box | Remove `border`+`bg-muted/20` when `!hasFilters`; `Empty` with `className="border-0 bg-transparent shadow-none"` + `p-6` (match default) |
| 16 | Up-to-date toast | Both triggers call `checkNow({ silent:false })`; header `help-menu.tsx:21` adds `Check for Updates…`; dev guard mocked: `if(DEV) showUpToDateToast(currentVersion ?? "0.0.0")` |
| 17 | Icon fix scope | Only `alerts-band.tsx:39,123` header icons — remove `bg-*` wrapper + colored `text-*`, use `text-muted-foreground/60` |

## 3. Architecture

```
apps/desktop/src
├── lib/db.ts                      — add wipeAllData({ resetSettings })
├── features/admin/settings
│   ├── components/data-tab.tsx    — WipeDataCard Danger Zone
│   ├── components/wipe-data-card.tsx (new)
│   └── hooks/use-settings.ts      — suppliers source
├── features/shared/components
│   ├── apple-date-picker.tsx (new)
│   └── quantity-stepper.tsx (new)
├── features/inventory/components
│   ├── stock-in-wizard.tsx        — supplier dynamic/optional, category placeholder, temp unit sourced
│   ├── stock-out-wizard.tsx       — QuantityStepper
│   ├── expiry-list.tsx / low-stock-list.tsx — plain empty
│   └── ... (reorder-sheet, dispose-confirm, thresholds-tab)
├── features/dashboard/components/alerts-band.tsx — icon wash removal + empty plain
├── features/help/components/help-menu.tsx — Check for Updates
└── features/updater/use-updater.tsx / update-toasts.tsx — dev mock
```

No backend, no new DB tables, no template 41-column change. `SUPPLIER_LEAD_TIMES` stays for lead-time calculation only with comment "not for UI dropdown".

## 4. Data model

### 4.1 Wipe
- No migration. Sequential `db.exec("DELETE ...")` FK-safe order: `dispensing_events` → `request_queue` → `inventory_items` → `VACUUM`.
- After SQL: enumerate `localStorage` keys `cmis-zoom`, `cmis-sidebar-collapsed`, `cmis-density`, `cmis-panel-ratio`, `cmis-help-hint` etc. (`cmis-*` prefix) + `LazyStore("updater.json")` `lastCheckedAt` reset; no blanket `clear()`.
- If `resetSettings` true → `DELETE FROM app_meta` / `LazyStore` + `setSettings(DEFAULT_SETTINGS)` + `saveUpdaterSettings(DEFAULT_UPDATER_SETTINGS)`.
- Post-wipe: `toast.success("All data wiped")`, `queryClient.invalidateQueries(["inventory"])`, reset wizard draft, clear `selectedBatchKeys`/`selectedIds`.

### 4.2 Supplier
| Field | Before | After |
|-------|--------|-------|
| `StockInDraft.supplier` | `Supplier` (string union) | `string | null` ("" normalized to null) |
| `StockInPayload.supplier` | `string` required | `string | null` |
| DB `inventory_items.supplier` | `TEXT NOT NULL DEFAULT ''` | keep `TEXT`, app treats "" ↔ null |
| `validateStep(3)` | `draft.supplier.trim().length>0 && future && qty>=1 && batch` | `batch.trim() && future && qty>=1` |
| Initial state | `useState<Supplier>(mockSuppliers[0])` | `useState<string | null>(null)` |

### 4.3 Remaining hardcodes
| Location | Current | Replacement |
|----------|---------|-------------|
| `stock-in-wizard.tsx:14-18` mockSuppliers | `SUPPLIER_LEAD_TIMES.map(s=>s.name)` | Deleted; import `useSettings` |
| `:37` type Supplier | `(typeof mockSuppliers)[number]` | `type SupplierName = string` |
| `:267` unit select | 5 literals | Sourced from `useSettings().state.units` or settings vocab (temp) |
| `:480` category default | `INVENTORY_CATEGORIES[0]` | `""` placeholder |
| `:482` unit default | `"tablet"` | Deleted / sourced |

### 4.4 Date & quantity — no DB change
- Date `YYYY-MM-DD` ISO (`format.ts:67`), quantity `number` (`use-stock-mutations.ts:71`).

## 5. Code touchpoints (full)

| File | Change |
|------|--------|
| `lib/db.ts:29` | add `wipeAllData(opts?: { resetSettings?: boolean })` + `WIPE_STATEMENTS` |
| `features/admin/settings/components/data-tab.tsx:15` | add `WipeDataCard` above grid |
| `features/admin/settings/components/wipe-data-card.tsx` (new) | Danger Zone card + destructive button → ConfirmModal |
| `features/admin/components/confirm-modal.tsx:1` | reuse as-is (`typeToConfirm="WIPE"`) |
| `features/help/components/help-menu.tsx:21` | add `Check for Updates…` → `checkNow({silent:false})` |
| `features/updater/use-updater.tsx:230,234,310` | dev mock toast + expose `checkNow` |
| `features/inventory/components/stock-in-wizard.tsx:14` | major: remove mockSuppliers, useSettings, optional supplier, category placeholder, temp unit sourced |
| `features/shared/components/apple-date-picker.tsx` (new) | popover calendar + wheel fallback, emits YYYY-MM-DD |
| `features/shared/components/quantity-stepper.tsx` (new) | horizontal stepper, hold logic |
| Date usages `stock-in-wizard.tsx:359`, `extend-expiry-modal.tsx:179`, `requests-filter-bar.tsx:224` | replace `type="date"` |
| Quantity usages `stock-in-wizard.tsx:373`, `stock-out-wizard.tsx:328`, `reorder-sheet.tsx:233`, `dispose-confirm-modal.tsx:195`, `thresholds-tab.tsx:83/238` | replace `type="number"` |
| `features/inventory/hooks/use-stock-mutations.ts:71` | handle `supplier: string | null` |
| `features/inventory/components/expiry-list.tsx:442` / `low-stock-list.tsx:486` | plain empty when `!hasFilters` |
| `features/dashboard/components/alerts-band.tsx:39,64,123,149` | icon wash removal + empty plain |

## 6. UI specification

### 6.1 Wipe All Data — Settings → Data

```tsx
<div className="grid gap-4">
  <WipeDataCard onWipe={wipeAllData} />
  <div className="grid gap-4 min-[600px]:grid-cols-2">
    <ExportCard /><ImportCard />
  </div>
</div>
```

- Card: `border-destructive/30 bg-destructive/5`, `ShieldAlert text-destructive`, title `Danger Zone`.
- Body: checkbox `Also reset suppliers, categories, and settings` **default checked**, then `Button variant="destructive"` `Wipe All Data` → `ConfirmModal` with `typeToConfirm="WIPE"` (copy button, `typed.trim()==="WIPE"` gating, destructive variant).
- A11y: focus trap, `aria-describedby`, `Enter` gated, copy `aria-label`.

### 6.2 Stock-In Wizard — Supplier optional + hardcode removal

*StepBatch* uses `const { state } = useSettings(); const supplierNames = state.suppliers.map(s=>s.name);` with `(optional)` label, `Select supplier (optional)` placeholder, empty disabled message when `length===0`. `handleSupplierChange` normalizes `""→null`. `StepReview` shows `supplier ?? "—"`. Delete `mockSuppliers` const + `Supplier` type.

### 6.3 Apple Design Date Selector — Apple §12 Materials & Depth, §14 Reduced motion

**API:**
```tsx
type AppleDatePickerProps = {
  value: string; onChange: (iso: string) => void;
  min?: string; max?: string; placeholder?: string;
  disabled?: boolean; id?: string; "aria-label"?: string;
};
```

- Trigger: `InputGroup` with readOnly `Input` + `CalendarRange text-muted-foreground/60` + `press-feedback`.
- Popover: `surface-frosted backdrop-blur-[16px] saturate(160%) canvas-card rounded-xl border-border/40 animate-in fade-in zoom-in-95`.
- Grid: 7-col weekday `text-caption`, day `size-8 rounded-full hover:bg-accent press-feedback`, selected `bg-primary`, today `ring-1 ring-primary`, disabled `text-muted-foreground/30 pointer-events-none`.
- Header: `ChevronLeft/Right` with `press-feedback`, footer `Today` + `Clear`.
- Wheel fallback <640px: 3-col Month/Day/Year `scroll-snap`.
- Keyboard: `Enter` selects, `Escape` closes, `Arrow` navigates, hidden input accepts typed `YYYY-MM-DD`.
- Reduced motion: `@media (prefers-reduced-motion: reduce)` cross-fade not slide/spring.
- Emits `YYYY-MM-DD`, respects `min={todayIso}` for expiry validation.

### 6.4 Quantity Stepper — Apple §4 Behavior over animation

**API:**
```tsx
type QuantityStepperProps = {
  value: number | ""; onChange: (next: number | "") => void;
  min?: number; max?: number; step?: number;
  placeholder?: string; disabled?: boolean; id?: string; "aria-label"?: string;
};
```

- Horizontal `[-][input][+]`: wrapper `InputGroup border-input rounded-md overflow-hidden`; left `[-]` + center `Input type="text" inputMode="numeric" text-center hide-spinners` + right `[+]`; buttons `InputGroupButton size="icon" size-8 ChevronDown/Up size-3.5 text-muted-foreground hover:bg-accent active:scale-95 press-feedback disabled:opacity-40`.
- Hold: `setTimeout 400ms` then `setInterval 80→50ms`; `pointerup/leave/touchend` cancels.
- Wheel `preventDefault`, `ArrowUp/Down` ±1, `PageUp/Down` ±10, `Home/End` → min/max, `e/-/+/ .` prevented for integer step.
- `role="spinbutton"` + `aria-valuenow/min/max`, `aria-invalid` when out of range, `showErrors && value===""` → `border-destructive`.

### 6.5 Empty-state box

`expiry-list.tsx:442` + `low-stock-list.tsx:486` branch `hasFilters = totalUnfiltered > 0`; `hasFilters` → bordered `Empty className="border border-dashed bg-muted/20"` + `Clear filters` button; else → `Empty className="border-0 bg-transparent shadow-none"` + `p-6` plain centered `CheckCircle2` + text. `alerts-band.tsx:64,149` inner empty `rounded-xl border` → `p-6` no `rounded-xl border` when empty.

### 6.6 Up-to-date toast

`help-menu.tsx:21` 3 items with separator (`Check for Updates…` via `useUpdater().checkNow({silent:false})` + existing 2). `use-updater.tsx:234` dev guard → `showUpToDateToast(currentVersion ?? "0.0.0")` not silent return. Verification: both Settings → Updates → Check and Help → Check show `toast.success("You're on the latest version (vX.Y.Z)")` `id:cmis-updater`.

### 6.7 Icon background/color

`alerts-band.tsx:39`/`123` remove `bg-destructive/10`/`bg-[var(--warning)]/10` + colored `text-*`; use wrapper `flex size-9 shrink-0 items-center justify-center rounded-lg` (no bg) + icon `text-muted-foreground/60` matching `dashboard-metric-card.tsx:96` + `app-sidebar.tsx:150`. Row `StatusBadge`/`barColor` stay colored.

## 7. Apple Design mapping

- **§1 Response:** press-feedback on stepper buttons, date trigger, wipe button `active:scale-97`; respond on `pointerdown`.
- **§3 Interruptibility:** springs `damping 1.0` default (no bounce) for popover/drawer `duration 0.3-0.4`; wizard shell `direction`-aware spring.
- **§12 Materials:** `surface-frosted` + `backdrop-blur` for date popover; `material-sidebar` tokens reused from `globals.css:206`.
- **§14 Reduced motion/transparency:** popover cross-fade, solid fallback when `prefers-reduced-transparency`.
- **§15 Typography:** `text-caption` labels, `tracking -0.02em` for display titles.

## 8. Rollout plan (phased — recommended approach A)

**Phase 1 — Safety & hardcode removal (no new components):**
1. `lib/db.ts` `wipeAllData` + `WipeDataCard` + `data-tab.tsx` wiring + dev mock.
2. Stock-In wizard supplier dynamic/optional + category placeholder + temp unit sourced + `validateStep` fix; delete `mockSuppliers`.
3. `alerts-band.tsx` icon wash + `expiry-list`/`low-stock-list` plain empty + `help-menu` update item.

**Phase 2 — Shared UI components:**
4. `quantity-stepper.tsx` + replace 6 sites (wizard → thresholds/reorder/dispose).
5. `apple-date-picker.tsx` + replace 3 date inputs.

**Phase 3 — Polish & verification:**
6. A11y (keyboard, focus trap, screen reader), visual regression, e2e `wipe → empty → check update`; `pnpm dlx ultracite check` + `fix`.

## 9. Testing

Existing suites to update: `stock-in-wizard.test.tsx`, `data-tab.test.tsx`, `alerts-band.test.tsx`, `import/*`.

New coverage (8 areas §11):
1. Wipe: Danger Zone renders, `WIPE` gating, copy button, `DELETE` order, cancel no delete, `resetSettings` default checked.
2. Wizard supplier: options + placeholder, empty message, `null` passes validation, payload null, deleted supplier option.
3. Hardcode removal: no `mockSuppliers`, no 5 literals, category `""`.
4. Date picker: trigger, popover, day emit, `min` disabled, `From>To`, keyboard, wheel.
5. Stepper: click/hold, min/max disable, keyboard, block `e`, clamp blur.
6. Empty: `totalUnfiltered=0` → no border, `>0` → bordered + Clear.
7. Updater: `silent:false` shows up-to-date, `silent:true` no toast, offline error, dev mock.
8. Icons: no `bg-*`, `text-muted-foreground/60`.

Manual: `pnpm tauri dev` → Settings→Data→Wipe→type WIPE→inventory empty; Help→Check→toast; `/admin` expiry/low-stock empty → no box.

## 10. Edge cases

Wipe with filters / wizard open, pending import transaction, empty supplier list, deleted supplier row, category empty blocks Next, date `min` past disabled, `From>To` error, qty empty blocks Next, hold at max disabled, `e/-` prevented, `totalUnfiltered` branching, offline update, dev mock, icon regression.

## 11. Open items (resolved)

All 7 pre-design open items resolved per §2 overrides. Remaining: confirm `settings.units` shape for temp unit sourcing if field not yet present.

---

*Self-review:* No `TBD`/`TODO`; internal consistency checked (wipe maximal default checked + enumerate keys not blanket; unit temp sourced; date in `features/shared`; stepper horizontal; empty `p-6`; dev mock). Scope is single spec (7 fixes, 3 phases). No contradictions with `SUPPLIER_LEAD_TIMES` retention or row bar colors.
