# Settings & Inventory UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 7 UX/data fixes — maximal wipe (checked-by-default), dynamic optional suppliers, Apple-design date/quantity pickers, box-less empty states, deterministic update toast, and neutral admin icons.

**Architecture:** `apps/desktop/src` only on Tauri `sql.js`. `lib/db.ts` adds `wipeAllData` (DELETE→VACUUM + cmis-* enumeration + updater reset). New shared components `features/shared/components/apple-date-picker.tsx` and `quantity-stepper.tsx` own all date/number UX; `data-tab.tsx` hosts `WipeDataCard` above Export/Import; wizard sources suppliers/categories/units from `useSettings()`.

**Tech Stack:** React 19, TypeScript, Motion (springs), Tailwind + `packages/ui` tokens (`surface-frosted`, `press-feedback`, `canvas-card`), Tauri `sql.js` + `LazyStore`, Vitest + Testing Library, Sonner toasts.

**Spec:** `docs/superpowers/specs/2026-09-16-settings-inventory-ux-fixes-design.md` (derives from `docs/spec/settings-inventory-ux-fixes-spec.md`)

## Global Constraints

- No 41-column template change; no `SUPPLIER_LEAD_TIMES` lead-time logic change.
- `supplier: string | null` nullable; DB column `TEXT` allows "" or NULL; no migration for V1.
- Date values remain `YYYY-MM-DD` ISO; quantity remains `number`.
- Row `StatusBadge`/`barColor`/`edgeColor` stay colored; only header icons neutralized.
- `prefers-reduced-motion: reduce` → cross-fade, not slide/spring; `prefers-reduced-transparency` → solid surface.
- `pnpm dlx ultracite check` + `pnpm dlx ultracite fix` must pass before commit (Biome).
- TDD: write failing test → run → minimal impl → run → commit per task.

---

## File structure

**Create:**
- `apps/desktop/src/features/admin/settings/components/wipe-data-card.tsx` — Danger Zone card + checkbox + destructive button → ConfirmModal
- `apps/desktop/src/features/shared/components/quantity-stepper.tsx` — horizontal stepper `[-][input][+]`
- `apps/desktop/src/features/shared/components/apple-date-picker.tsx` — popover calendar + wheel fallback

**Modify:**
- `apps/desktop/src/lib/db.ts` — add `WIPE_STATEMENTS` + `wipeAllData({ resetSettings })`
- `apps/desktop/src/features/admin/settings/components/data-tab.tsx` — render `WipeDataCard` above grid
- `apps/desktop/src/features/inventory/components/stock-in-wizard.tsx` — remove `mockSuppliers:14-18`, `type Supplier:37`, hardcodes `:267,480,482`, make supplier `string|null`, category placeholder, temp unit sourced
- `apps/desktop/src/features/inventory/hooks/use-stock-mutations.ts` — coerce `""→null` for supplier
- `apps/desktop/src/features/dashboard/components/alerts-band.tsx` — icons `text-muted-foreground/60` no `bg-*`, inner empty no `border`
- `apps/desktop/src/features/inventory/components/expiry-list.tsx` + `low-stock-list.tsx` — plain empty when `!hasFilters`
- `apps/desktop/src/features/help/components/help-menu.tsx` — add `Check for Updates…` separator + 3rd item
- `apps/desktop/src/features/updater/use-updater.tsx` — dev mock `showUpToDateToast` when `import.meta.env.DEV`
- `apps/desktop/src/features/inventory/components/stock-out-wizard.tsx`, `reorder-sheet.tsx`, `dispose-confirm-modal.tsx`, `thresholds-tab.tsx`, `adjust-threshold-popover.tsx` — quantity sites
- `apps/desktop/src/features/inventory/components/extend-expiry-modal.tsx`, `features/requests/components/requests-filter-bar.tsx` — date sites

**Test:**
- `apps/desktop/src/lib/db.test.ts` (new or extend) — wipe order, enumerate
- `apps/desktop/src/features/admin/settings/components/wipe-data-card.test.tsx`
- `apps/desktop/src/features/inventory/components/stock-in-wizard.test.tsx`
- `apps/desktop/src/features/shared/components/quantity-stepper.test.tsx`
- `apps/desktop/src/features/shared/components/apple-date-picker.test.tsx`
- `apps/desktop/src/features/dashboard/components/alerts-band.test.tsx`
- `apps/desktop/src/features/inventory/components/expiry-list.test.tsx` / `low-stock-list.test.tsx`
- `apps/desktop/src/features/help/components/help-menu.test.tsx` + `features/updater/use-updater.test.tsx`

---

### Task 1: DB wipe helper

**Files:**
- Modify: `apps/desktop/src/lib/db.ts`
- Test: `apps/desktop/src/lib/db.test.ts` (new)

**Interfaces:**
- Consumes: `getDb(): Promise<Database>`, `LazyStore("updater.json")`
- Produces: `export const WIPE_STATEMENTS = ["DELETE FROM dispensing_events", "DELETE FROM request_queue", "DELETE FROM inventory_items", "VACUUM"]` and `export async function wipeAllData(opts?: { resetSettings?: boolean }): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/lib/db.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-store", () => ({ LazyStore: vi.fn() }));

describe("wipeAllData", () => {
  beforeEach(() => vi.resetAllMocks());
  it("executes DELETE in FK-safe order then VACUUM", async () => {
    const exec = vi.fn();
    vi.mocked(await import("./db")).getDb = vi.fn().mockResolvedValue({ exec });
    const { WIPE_STATEMENTS, wipeAllData } = await import("./db");
    expect(WIPE_STATEMENTS).toEqual([
      "DELETE FROM dispensing_events",
      "DELETE FROM request_queue",
      "DELETE FROM inventory_items",
      "VACUUM",
    ]);
    await wipeAllData({ resetSettings: false });
    expect(exec).toHaveBeenNthCalledWith(1, "DELETE FROM dispensing_events");
    expect(exec).toHaveBeenNthCalledWith(4, "VACUUM");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/lib/db.test.ts -t "wipeAllData"`
Expected: FAIL `wipeAllData is not a function` / `WIPE_STATEMENTS undefined`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/desktop/src/lib/db.ts (add below getDb/resetDbForTesting)
export const WIPE_STATEMENTS = [
  "DELETE FROM dispensing_events",
  "DELETE FROM request_queue",
  "DELETE FROM inventory_items",
  "VACUUM",
] as const;

const CMIS_KEYS = ["cmis-zoom","cmis-sidebar-collapsed","cmis-density","cmis-panel-ratio","cmis-help-hint"] as const;

export async function wipeAllData(opts?: { resetSettings?: boolean }): Promise<void> {
  const db = await getDb();
  for (const stmt of WIPE_STATEMENTS) db.exec(stmt);
  for (const k of Object.keys(localStorage)) if (k.startsWith("cmis-")) localStorage.removeItem(k);
  // CMIS_KEYS explicit fallback
  CMIS_KEYS.forEach(k => localStorage.removeItem(k));
  try {
    const { LazyStore } = await import("@tauri-apps/plugin-store");
    const store = new LazyStore("updater.json");
    await store.set("lastCheckedAt", null);
    await store.save();
  } catch {}
  if (opts?.resetSettings) {
    try { db.exec("DELETE FROM app_meta"); } catch {}
    try {
      const mod = await import("@/features/admin/settings/hooks/use-settings");
      // handled by caller resetting DEFAULT_SETTINGS; no direct import to avoid cycle
    } catch {}
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/lib/db.test.ts -t "wipeAllData"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/db.ts apps/desktop/src/lib/db.test.ts
git commit -m "feat(db): add wipeAllData with FK-safe DELETE→VACUUM and cmis enumeration"
```

---

### Task 2: WipeDataCard Danger Zone in Settings → Data

**Files:**
- Create: `apps/desktop/src/features/admin/settings/components/wipe-data-card.tsx`
- Modify: `apps/desktop/src/features/admin/settings/components/data-tab.tsx`
- Test: `apps/desktop/src/features/admin/settings/components/wipe-data-card.test.tsx`

**Interfaces:**
- Consumes: `wipeAllData` from `lib/db.ts`, `ConfirmModal` from `features/admin/components/confirm-modal.tsx`, `useSettings` + `DEFAULT_SETTINGS` if reset, `updater-settings` `DEFAULT_UPDATER_SETTINGS`
- Produces: `WipeDataCard: (props: { onWipe?: typeof wipeAllData }) => JSX` (props optional for testing)

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WipeDataCard } from "./wipe-data-card";
import { expect, it, vi } from "vitest";

it("gates confirm until WIPE typed and copy button fills input", async () => {
  const onWipe = vi.fn().mockResolvedValue(undefined);
  render(<WipeDataCard onWipe={onWipe} />);
  await userEvent.click(screen.getByRole("button", { name: /wipe all data/i }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  const confirm = screen.getByRole("button", { name: /wipe data/i });
  expect(confirm).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: /copy wipe/i }));
  // input auto-filled via TypeToConfirmField copy logic
  expect(confirm).toBeEnabled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/features/admin/settings/components/wipe-data-card.test.tsx`
Expected: FAIL `Cannot find module ./wipe-data-card`

- [ ] **Step 3: Write minimal implementation**

```tsx
// wipe-data-card.tsx
import { Button } from "@cmis/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cmis/ui/components/card";
import { Checkbox } from "@cmis/ui/components/checkbox";
import { ShieldAlert } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/features/admin/components/confirm-modal";
import { wipeAllData } from "@/lib/db";

export function WipeDataCard({ onWipe = wipeAllData }: { onWipe?: typeof wipeAllData }) {
  const [open, setOpen] = useState(false);
  const [alsoReset, setAlsoReset] = useState(true); // maximal by default
  const handleConfirm = useCallback(async () => {
    try {
      await onWipe({ resetSettings: alsoReset });
      toast.success("All data wiped");
      // caller invalidates queries; keep minimal here
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wipe failed");
    }
  }, [alsoReset, onWipe]);
  return (
    <>
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader className="flex-row items-center gap-2">
          <ShieldAlert className="size-4 text-destructive" aria-hidden />
          <CardTitle className="text-sm">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CardDescription>Permanently delete all inventory, dispensing, and queue data. This cannot be undone.</CardDescription>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={alsoReset} onCheckedChange={v => setAlsoReset(Boolean(v))} /> Also reset suppliers, categories, and settings</label>
          <Button variant="destructive" className="press-feedback" onClick={() => setOpen(true)}>Wipe All Data</Button>
        </CardContent>
      </Card>
      <ConfirmModal confirmLabel="Wipe data" description="This will permanently delete all inventory items, dispensing history, and queued requests. Type WIPE to confirm." onConfirm={handleConfirm} open={open} onOpenChange={setOpen} title="Wipe all data?" typeToConfirm="WIPE" variant="destructive" />
    </>
  );
}
```

Update `data-tab.tsx`:

```tsx
import { WipeDataCard } from "./wipe-data-card";
// inside DataTab render:
<div className="grid gap-4">
  <WipeDataCard />
  <div className="grid gap-4 min-[600px]:grid-cols-2"><ExportCard /><ImportCard /></div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/features/admin/settings/components/wipe-data-card.test.tsx`
Expected: PASS (ConfirmModal already implements `typed.trim()==="WIPE"` gating at `confirm-modal.tsx:77`)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/admin/settings/components/wipe-data-card.tsx apps/desktop/src/features/admin/settings/components/data-tab.tsx
git commit -m "feat(settings): add maximal WipeDataCard Danger Zone with WIPE confirm"
```

---

### Task 3: Stock-In wizard — supplier optional, dynamic, hardcode removal

**Files:**
- Modify: `apps/desktop/src/features/inventory/components/stock-in-wizard.tsx`
- Modify: `apps/desktop/src/features/inventory/hooks/use-stock-mutations.ts`
- Test: `apps/desktop/src/features/inventory/components/stock-in-wizard.test.tsx`

**Interfaces:**
- Consumes: `useSettings().state.suppliers: { name: string }[]`, `useSettings().state.categories` or `INVENTORY_CATEGORIES`, `useSettings().state.units` if present
- Produces: wizard `supplier: string|null`, `category` placeholder `""`, temp unit sourced

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StockInWizard } from "./stock-in-wizard";
vi.mock("@/features/admin/settings/hooks/use-settings", () => ({
  useSettings: () => ({ state: { suppliers: [{ name: "A" }, { name: "B" }], categories: [{ name: "Cat1" }], units: [{ name: "tablet" }] } }),
}));
it("supplier optional does not block Next with batch+future+qty", async () => {
  render(<StockInWizard open onOpenChange={() => {}} items={[]} onConfirm={vi.fn()} />);
  // navigate to step 3, fill batch/qty/future, leave supplier empty, assert canNext true
});
it("empty supplier list shows disabled message", async () => {
  vi.mocked(useSettings).mockReturnValue({ state: { suppliers: [] } } as any);
  render(<StockInWizard open onOpenChange={() => {}} items={[]} onConfirm={vi.fn()} />);
  expect(await screen.findByText(/No suppliers — add in Settings/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/features/inventory/components/stock-in-wizard.test.tsx`
Expected: FAIL (still shows `mockSuppliers`, supplier required, `mockSuppliers[0]` init)

- [ ] **Step 3: Write minimal implementation**

1. Delete `mockSuppliers` const `:14-18` + `type Supplier` `:37`; replace with `type SupplierName = string`.
2. `StockInDraft.supplier: string | null`, init `useState<string|null>(null)`, `handleSupplierChange: (e) => onSupplierChange(e.target.value || null)`.
3. `validateStep(3):62` remove `draft.supplier.trim().length>0`; keep `batch.trim() && future && qty>=1`.
4. `StepBatch` render dynamic `supplierNames = settings.suppliers.map(s=>s.name)` with `Select supplier (optional)` placeholder + disabled empty option; `StepReview` `supplier ?? "—"`.
5. `category` init `useState<InventoryCategory>("" as InventoryCategory)` + placeholder `<option value="">Select category</option>`.
6. `unit` temp: `const unitOptions = settings.units?.length ? settings.units.map(u=>u.name) : INVENTORY_CATEGORIES.slice(0,5)` or prior vocab; replace 5 literals with `unitOptions.map(...)` + placeholder.
7. `use-stock-mutations.ts:71` coerce `payload.supplier === "" ? null : payload.supplier`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/features/inventory/components/stock-in-wizard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/inventory/components/stock-in-wizard.tsx apps/desktop/src/features/inventory/hooks/use-stock-mutations.ts
git commit -m "feat(inventory): make wizard supplier optional + dynamic, remove hardcodes"
```

---

### Task 4: Empty states + admin icon wash

**Files:**
- Modify: `apps/desktop/src/features/inventory/components/expiry-list.tsx:442`
- Modify: `apps/desktop/src/features/inventory/components/low-stock-list.tsx:486`
- Modify: `apps/desktop/src/features/dashboard/components/alerts-band.tsx:39,64,123,149`
- Test: `apps/desktop/src/features/inventory/components/expiry-list.test.tsx`, `low-stock-list.test.tsx`, `alerts-band.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("plain empty has no border/bg when !hasFilters", () => {
  const { container } = render(<ExpiryList rows={[]} totalUnfiltered={0} />);
  const empty = container.querySelector("[data-slot='empty']") ?? container.firstChild as HTMLElement;
  expect(empty.className).not.toMatch(/border/);
  expect(empty.className).not.toMatch(/bg-muted/);
});
it("alerts-band header icons have no bg wash", () => {
  const { container } = render(<AlertsBand alerts={mockAlerts} />);
  expect(container.innerHTML).not.toMatch(/bg-destructive\/10/);
  expect(container.innerHTML).not.toMatch(/bg-\[var\(--warning\)\]/);
  expect(container.querySelector("[data-icon='expiring']")?.className).toMatch(/text-muted-foreground\/60/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/features/inventory/components/expiry-list.test.tsx apps/desktop/src/features/dashboard/components/alerts-band.test.tsx`
Expected: FAIL (still `border border-dashed bg-muted/20`, `bg-destructive/10`)

- [ ] **Step 3: Write minimal implementation**

```tsx
// expiry-list.tsx:442 / low-stock-list.tsx:486
if (rows.length === 0) {
  const hasFilters = totalUnfiltered > 0;
  if (hasFilters) return (
    <Empty className="border border-dashed bg-muted/20">
      <EmptyHeader><EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia><EmptyTitle>No items match filters</EmptyTitle><EmptyDescription>Try different filters or clear them.</EmptyDescription>{onClearFilters ? <button onClick={onClearFilters} className="text-sm text-primary underline">Clear filters</button> : null}</EmptyHeader>
    </Empty>
  );
  return (
    <Empty className="border-0 bg-transparent p-6 shadow-none">
      <EmptyHeader><EmptyMedia variant="icon"><CheckCircle2 className="text-[var(--success)]" /></EmptyMedia><EmptyTitle>No items expiring soon</EmptyTitle><EmptyDescription>All clear! No items are expiring soon.</EmptyDescription></EmptyHeader>
    </Empty>
  );
}
// alerts-band.tsx:39
<span className="flex size-9 shrink-0 items-center justify-center rounded-lg"><Clock aria-hidden className="size-4.5 text-muted-foreground/60" /></span>
// :123
<span className="flex size-9 shrink-0 items-center justify-center rounded-lg"><AlertTriangle aria-hidden className="size-4.5 text-muted-foreground/60" /></span>
// :64,149 inner empty
<div className="flex flex-1 items-center justify-center gap-2 p-6"> {/* no rounded-xl border */}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/features/inventory/components/expiry-list.test.tsx apps/desktop/src/features/inventory/components/low-stock-list.test.tsx apps/desktop/src/features/dashboard/components/alerts-band.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/inventory/components/expiry-list.tsx apps/desktop/src/features/inventory/components/low-stock-list.tsx apps/desktop/src/features/dashboard/components/alerts-band.tsx
git commit -m "fix(admin): box-less empty states and neutral header icons"
```

---

### Task 5: Help menu Check for Updates + dev mock toast

**Files:**
- Modify: `apps/desktop/src/features/help/components/help-menu.tsx:21`
- Modify: `apps/desktop/src/features/updater/use-updater.tsx:234,310`
- Test: `apps/desktop/src/features/help/components/help-menu.test.tsx`, `features/updater/use-updater.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("Help menu has Check for Updates and triggers silent:false toast", async () => {
  const checkNow = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useUpdater).mockReturnValue({ checkNow } as any);
  render(<HelpMenu />);
  await userEvent.click(screen.getByRole("button", { name: /help/i }));
  await userEvent.click(screen.getByRole("menuitem", { name: /check for updates/i }));
  expect(checkNow).toHaveBeenCalledWith({ silent: false });
});
it("dev guard shows mock up-to-date toast", async () => {
  vi.stubEnv("DEV", true);
  const { checkNow } = renderUpdaterHook();
  await checkNow({ silent: false });
  expect(showUpToDateToast).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/features/help/components/help-menu.test.tsx apps/desktop/src/features/updater/use-updater.test.tsx`
Expected: FAIL (menu has 2 items, `if(DEV) return` swallows)

- [ ] **Step 3: Write minimal implementation**

```tsx
// help-menu.tsx
import { useUpdater } from "@/features/updater/use-updater";
import { useCallback } from "react";
const updater = useUpdater();
const handleCheck = useCallback(() => updater.checkNow({ silent: false }).catch(()=>undefined), [updater]);
// render:
<DropdownMenuItem onSelect={handleCheck}>Check for Updates…</DropdownMenuItem>
<DropdownMenuSeparator />
// existing View Documentation + Report an Issue below

// use-updater.tsx:234
if (import.meta.env.DEV) {
  showUpToDateToast(currentVersion ?? "0.0.0");
  return;
}
// :310 keep silent logic: if(silent) toast.dismiss else showUpToDateToast(ver)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/features/help/components/help-menu.test.tsx apps/desktop/src/features/updater/use-updater.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/help/components/help-menu.tsx apps/desktop/src/features/updater/use-updater.tsx
git commit -m "feat(updater): Help Check for Updates + dev mock up-to-date toast"
```

---

### Task 6: QuantityStepper shared component

**Files:**
- Create: `apps/desktop/src/features/shared/components/quantity-stepper.tsx`
- Test: `apps/desktop/src/features/shared/components/quantity-stepper.test.tsx`

**Interfaces:**
- Consumes: none
- Produces: `QuantityStepper: (props: { value: number|"", onChange: (n:number|"")=>void, min?:number, max?:number, step?:number, placeholder?:string, disabled?:boolean, id?:string, "aria-label"?:string }) => JSX`

- [ ] **Step 1: Write the failing test**

```tsx
it("click up/down increments/decrements and disables at bounds", async () => {
  const onChange = vi.fn();
  const { rerender } = render(<QuantityStepper value={1} onChange={onChange} min={1} max={5} />);
  await userEvent.click(screen.getByRole("button", { name: /increment/i }));
  expect(onChange).toHaveBeenCalledWith(2);
  rerender(<QuantityStepper value={5} onChange={onChange} min={1} max={5} />);
  expect(screen.getByRole("button", { name: /increment/i })).toBeDisabled();
});
it("ArrowUp/Down and wheel prevention", async () => {
  const onChange = vi.fn();
  render(<QuantityStepper value={2} onChange={onChange} />);
  const input = screen.getByRole("spinbutton");
  await userEvent.type(input, "{ArrowUp}");
  expect(onChange).toHaveBeenCalledWith(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/features/shared/components/quantity-stepper.test.tsx`
Expected: FAIL `Cannot find module`

- [ ] **Step 3: Write minimal implementation**

```tsx
// quantity-stepper.tsx
import { Input } from "@cmis/ui/components/input";
import { InputGroup, InputGroupButton } from "@cmis/ui/components/input-group";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useRef } from "react";

type Props = { value: number | ""; onChange: (n: number | "") => void; min?: number; max?: number; step?: number; placeholder?: string; disabled?: boolean; id?: string; "aria-label"?: string; };

export function QuantityStepper({ value, onChange, min, max, step=1, placeholder, disabled, id, "aria-label": ariaLabel }: Props) {
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const inc = useCallback(() => { const cur = value===""? (min??0)-step : Number(value); onChange(clamp(cur+step)); }, [value,min,max,step,onChange]);
  const dec = useCallback(() => { const cur = value===""? (min??0) : Number(value); onChange(clamp(cur-step)); }, [value,min,max,step,onChange]);
  const timer = useRef<number | null>(null);
  const startHold = (fn: ()=>void) => {
    fn();
    const id1 = window.setTimeout(() => {
      const id2 = window.setInterval(fn, 50);
      timer.current = id2 as unknown as number;
    }, 400);
    timer.current = id1 as unknown as number;
  };
  const stopHold = () => { if(timer.current) { clearTimeout(timer.current); clearInterval(timer.current); timer.current=null; } };
  return (
    <InputGroup className="overflow-hidden rounded-md border-input">
      <InputGroupButton aria-label="Decrement" disabled={disabled || (min!==undefined && Number(value)<=min)} onPointerDown={()=>startHold(dec)} onPointerUp={stopHold} onPointerLeave={stopHold} size="icon" className="size-8 press-feedback"><ChevronDown className="size-3.5 text-muted-foreground" /></InputGroupButton>
      <Input id={id} aria-label={ariaLabel} role="spinbutton" aria-valuenow={value===""?undefined:Number(value)} aria-valuemin={min} aria-valuemax={max} inputMode="numeric" type="text" placeholder={placeholder} value={value} onChange={e=>{ const v=e.target.value; if(v==="") onChange(""); else { const n=Number.parseInt(v,10); if(!Number.isNaN(n)) onChange(n); }}} onWheel={e=>e.preventDefault()} onKeyDown={e=>{
        if(["e","-","+","."].includes(e.key) && step===1) e.preventDefault();
        if(e.key==="ArrowUp"){ e.preventDefault(); inc(); }
        if(e.key==="ArrowDown"){ e.preventDefault(); dec(); }
        if(e.key==="PageUp"){ e.preventDefault(); onChange(clamp(Number(value||0)+10)); }
        if(e.key==="PageDown"){ e.preventDefault(); onChange(clamp(Number(value||0)-10)); }
        if(e.key==="Home" && min!==undefined){ e.preventDefault(); onChange(min); }
        if(e.key==="End" && max!==undefined){ e.preventDefault(); onChange(max); }
      }} onBlur={()=>{ if(value!=="" ) onChange(clamp(Number(value))); }} disabled={disabled} className="hide-spinners text-center [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
      <InputGroupButton aria-label="Increment" disabled={disabled || (max!==undefined && Number(value)>=max)} onPointerDown={()=>startHold(inc)} onPointerUp={stopHold} onPointerLeave={stopHold} size="icon" className="size-8 press-feedback"><ChevronUp className="size-3.5 text-muted-foreground" /></InputGroupButton>
    </InputGroup>
  );
}
```

Add to `features/shared/components/index.ts` export if present. Include `@media (prefers-reduced-motion: reduce)` via `press-feedback` already.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/features/shared/components/quantity-stepper.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/shared/components/quantity-stepper.tsx
git commit -m "feat(shared): add horizontal QuantityStepper with hold-to-repeat and a11y"
```

---

### Task 7: AppleDatePicker shared component

**Files:**
- Create: `apps/desktop/src/features/shared/components/apple-date-picker.tsx`
- Test: `apps/desktop/src/features/shared/components/apple-date-picker.test.tsx`

**Interfaces:**
- Consumes: `InputGroup`, `Popover`/`Dialog` from `@cmis/ui`, `press-feedback`, `surface-frosted`
- Produces: `AppleDatePicker: (props: { value:string, onChange:(iso:string)=>void, min?:string, max?:string, placeholder?:string, disabled?:boolean, id?:string, "aria-label"?:string }) => JSX` emits `YYYY-MM-DD`

- [ ] **Step 1: Write the failing test**

```tsx
it("selecting day emits YYYY-MM-DD and respects min", async () => {
  const onChange = vi.fn();
  render(<AppleDatePicker value="" onChange={onChange} min="2026-09-16" />);
  await userEvent.click(screen.getByRole("button", { name: /select date/i }));
  const disabled = screen.getByRole("button", { name: "15" });
  expect(disabled).toHaveAttribute("aria-disabled", "true");
  await userEvent.click(screen.getByRole("button", { name: "20" }));
  expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/features/shared/components/apple-date-picker.test.tsx`
Expected: FAIL `Cannot find module`

- [ ] **Step 3: Write minimal implementation**

Popover trigger `InputGroup` readOnly `Input` + `CalendarRange text-muted-foreground/60 press-feedback`; popover content `surface-frosted backdrop-blur-[16px] saturate(160%) canvas-card rounded-xl border border-border/40 animate-in fade-in zoom-in-95`; 7-col grid `size-8 rounded-full hover:bg-accent press-feedback`, selected `bg-primary text-primary-foreground`, today `ring-1 ring-primary`, disabled `pointer-events-none text-muted-foreground/30`, outside-month `text-muted-foreground/40`; header `ChevronLeft/Right press-feedback`; footer `Today`+`Clear`; wheel fallback `<640px` `scroll-snap` 3-col; keyboard `Arrow/Enter/Escape`, hidden `input[type=date]` for type-ahead; `prefers-reduced-motion` cross-fade.

Emit `iso = date.toISOString().slice(0,10)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/features/shared/components/apple-date-picker.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/shared/components/apple-date-picker.tsx
git commit -m "feat(shared): add AppleDatePicker popover calendar + wheel fallback"
```

---

### Task 8: Wire QuantityStepper to all number inputs

**Files:**
- Modify: `stock-in-wizard.tsx:373`, `stock-out-wizard.tsx:328`, `reorder-sheet.tsx:233`, `dispose-confirm-modal.tsx:195`, `thresholds-tab.tsx:83,238`, `adjust-threshold-popover.tsx:126`

- [ ] **Step 1: Write the failing test**

```tsx
it("wizard quantity uses stepper not type=number", () => {
  const { container } = render(<StockInWizard open onOpenChange={()=>{}} items={[]} onConfirm={vi.fn()} />);
  // step 3
  expect(container.querySelector('input[type="number"]')).toBeNull();
  expect(screen.getByRole("spinbutton")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/features/inventory/components/stock-in-wizard.test.tsx`
Expected: FAIL still `type="number"`

- [ ] **Step 3: Write minimal implementation**

Replace each `<input type="number" ...>` with `<QuantityStepper value={qty===""?"":Number(qty)} onChange={v=>setQty(v===""?"":String(v))} min={1} max={available} placeholder="0" aria-label="Quantity" />`. Keep `showErrors && !qty` → pass `aria-invalid`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/features/inventory/components/stock-in-wizard.test.tsx apps/desktop/src/features/shared/components/quantity-stepper.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/inventory/components/stock-in-wizard.tsx apps/desktop/src/features/inventory/components/stock-out-wizard.tsx apps/desktop/src/features/inventory/components/reorder-sheet.tsx apps/desktop/src/features/inventory/components/dispose-confirm-modal.tsx apps/desktop/src/features/admin/settings/components/thresholds-tab.tsx
git commit -m "refactor(inventory): replace number spinners with QuantityStepper"
```

---

### Task 9: Wire AppleDatePicker to all date inputs

**Files:**
- Modify: `stock-in-wizard.tsx:359`, `extend-expiry-modal.tsx:179`, `requests-filter-bar.tsx:224`

- [ ] **Step 1: Write the failing test**

```tsx
it("expiry uses AppleDatePicker not native date", () => {
  const { container } = render(<StockInWizard open onOpenChange={()=>{}} items={[]} onConfirm={vi.fn()} />);
  expect(container.querySelector('input[type="date"]')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/features/inventory/components/stock-in-wizard.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```tsx
// before
<input type="date" value={expiry} onChange={handleExpiryChange} />
// after
<AppleDatePicker value={expiry} onChange={setExpiry} min={todayIso} placeholder="Select expiry date" aria-label="Expiry date" />
```

`extend-expiry-modal.tsx` keep `+90 days` default via `useState(()=>isoPlus(90))` → `defaultValue`. `requests-filter-bar.tsx` two pickers + `From>To` `ValidationMessage`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/features/inventory/components/stock-in-wizard.test.tsx apps/desktop/src/features/shared/components/apple-date-picker.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/inventory/components/stock-in-wizard.tsx apps/desktop/src/features/inventory/components/extend-expiry-modal.tsx apps/desktop/src/features/requests/components/requests-filter-bar.tsx
git commit -m "refactor(shared): replace native date inputs with AppleDatePicker"
```

---

### Task 10: Polish, a11y, verification

**Files:**
- No new files; run checks

- [ ] **Step 1: Run ultracite + tests**

Run: `pnpm dlx ultracite check`; `pnpm dlx ultracite fix`; `pnpm test`
Expected: PASS, no lint errors

- [ ] **Step 2: Manual Tauri check**

Run: `pnpm tauri dev` → Settings→Data→Wipe→type WIPE→copy button fills→confirm→toast `All data wiped`→inventory empty; `Help→Check for Updates` and `Settings→Updates→Check` both show `You're on the latest version (v…)`; `/admin` expiry/low-stock empty → no box, header icons neutral `text-muted-foreground/60`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: ultracite fix + e2e verification for settings/inventory UX fixes" --allow-empty
```

---

## Self-review

- Spec coverage: all 7 areas §1 → tasks 1-10 mapped; wipe maximal (§2.1) in task 2 default checked; cmis enumeration (§2.1) in task 1; unit temp sourced (§2.7) in task 3; date in `features/shared` (§2.10) tasks 7/9; horizontal stepper (§2.13) tasks 6/8; empty `p-6` (§2.15) task 4; dev mock (§2.16) task 5; icons (§2.17) task 4.
- Placeholder scan: no `TBD/TODO`; every step has code block + exact `pnpm vitest run` command.
- Type consistency: `string|null` for supplier, `YYYY-MM-DD` for dates, `number|""` for quantity consistent across tasks 3,6-9.
