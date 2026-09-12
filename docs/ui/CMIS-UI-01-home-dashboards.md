# CMIS UI/UX Spec — 01 Home Dashboards (Staff / Admin / Viewer)

Spec ID: CMIS-UI-01 | Routes: `/staff` · `/admin` · `/viewer` | Depends on: 00 Overview

---

## 1. Purpose & Role Adaptation

Home is the _triage landing_ — "what needs attention today" — not a marketing dashboard. Each role lands immediately into useful context (Wayfinding §16: Where am I?).

| Role       | Primary question                                    | Content promise                                           |
| ---------- | --------------------------------------------------- | --------------------------------------------------------- |
| **Staff**  | "What must I do before the counter gets busy?"      | Alerts first, stats second, recent activity third         |
| **Admin**  | "Is the system healthy and are branches compliant?" | Staff triage + system health + 24h activity               |
| **Viewer** | "Can I get what I need right now?"                  | CTA to request + personal status, not inventory education |

---

## 2. Layout Options & Recommendation

### 2.1 Layout Alternatives

| Option                                                 | Structure                                                                                                                                                    | Trade-offs                                                                                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Uniform grid (spec original)**                    | 4 stat cards row + alerts list + activity feed + quick actions bar                                                                                           | + Familiar, scannable row. − Ignores priority (stats ≠ alerts); quick-actions bar competes with nav                                                                               |
| **B. Alert-first split**                               | Top 40%: expiry + low-stock alert cards (side-by-side, 50/50); middle: stats row; bottom: activity + quick actions                                           | + Prioritizes safety (Responsibility); alerts are the reason to open the app at 7am. − Slightly less "dashboardy" at first glance                                                 |
| **C. Alert-first split + density-aware (RECOMMENDED)** | **B + adaptive density (§2.3 of 00):** Compact = 4-col stat row, comfortable = 2×2 stat grid. Activity feed collapses to 5 rows with "Show more" in compact. | + Respects interview's adaptive density + equal Admin/Staff balance (Admin needs health card without pushing alerts off-screen). Stacks gracefully at 900px (alerts go vertical). |

**Chosen layout (RECOMMENDED):**

```
Staff (/staff) — Comfortable density
┌──────────────────────────────────────────────────────────────┐
│  Alerts band (2 cards)  │ Expiry (top 5)  │  Low-stock (top 5) │  ← View All →
├──────────────────────────────────────────────────────────────┤
│  Stats row: [Total Items] [Low Stock] [Pending Req] [Expiring] │  ← 4-col, or 2×2 on narrow
├──────────────────────────────────────────────────────────────┤
│  Recent Activity (last 10, virtualized)  │  Quick Actions   │
│  timestamp · user · action                │  [Stock In][Stock Out][Scan][Requests] │
└──────────────────────────────────────────────────────────────┘

Admin (/admin): same + 3rd row: [System Health] [24h Activity] [Pending Admin Actions]
Viewer (/viewer): centered 640px column, not full-width grid (see §5)
```

### 2.2 Why Not a Dense Analytics Hero

Home is _not_ Reports (§7). No charts on Home — they belong in `/reports` where filters apply. Home's only "chart" is the tiny trend sparkline inside each stat card (optional, muted, 24px height) — Utility, not decoration.

---

## 3. Components & Information Hierarchy

### 3.1 Stat Cards (4 per role, 5–7 for Admin)

| Element              | Hierarchy                                           | Token                                                                 |
| -------------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| Number (display)     | Largest, `display` scale, `-0.02em`, weight 700     | Branded headings: number in `foreground`, label in `muted-foreground` |
| Label                | `caption` 0.81rem, uppercase 0.06em tracking        | Never truncated                                                       |
| Status dot           | 8px, green/orange/red/gray per spec §12 conventions | Paired with text — not color-alone                                    |
| Sparkline (optional) | 24px, `muted` stroke, no axis                       | Only if 7-day trend data exists; hidden otherwise                     |
| Tap target           | Full card is button → navigates to relevant list    | `pointerdown` highlight `scale 0.98` (§1 Response)                    |

**Adaptive behavior:** In Compact, cards reduce padding 20→12px and hide sparkline to preserve row height for more data-above-fold. In Comfortable, padding breathes and sparkline appears.

**Empty:** never empty — stats always have 0, but alert lists inside this band can empty (see §3.2).

### 3.2 Alert Summary Cards (Expiry + Low-stock, top 5 each)

- Compact list (not table) — `marker` + item name + badge + relative time.
- Row height 44px compact / 52px comfortable; hover reveals inline action (Dispose / Reorder) as ghost button — progressive disclosure (Simplicity).
- "View All →" link navigates to `/inventory/expiry` or `/inventory/low-stock`; count badge matches sidebar badge — Familiarity: same number everywhere.

**Empty state:** checkmark + "All clear" + `muted-foreground` — delight through relief, not confetti.

### 3.3 Recent Activity Feed

- Last 10 actions, timestamp + user + action, relative time ("2h ago") with absolute on hover tooltip.
- Virtualized if extended to 50 (Admin 24h view).
- Each row is `44px`, left 3px accent bar colored by action type (stock-in: blue, dispense: green, request: amber) — mapping (§16: place control near what it affects).
- Wayfinding: feed header says "Recent activity — last 10" so the user knows scope.

### 3.4 Quick Actions

| Question            | Options                                             | Recommendation                                                                                                                             |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Where do they live? | In header / in Home card / floating bar             | **In Home only** — header stays global (branch/palette/density). Floating bar steals from tables.                                          |
| Which actions?      | Spec: Stock In, Stock Out, Scan Item, View Requests | **Keep 4, but Scan is a _variant_ of Stock In** (same entry point). Prevents duplicate affordance confusion.                               |
| Interaction         | Instant nav vs sheet                                | **Sheet with spring** (Stock In wizard) originating from the button's position (`transform-origin: button rect`) — spatial consistency §7. |

Buttons: `Button` size `lg` in Comfortable / `default` in Compact; icons from `lucide-react` consistent with sidebar.

---

## 4. Admin Extension

Admin Home appends a 3-card row _below_ stats (not above — triage stays top):

| Card                      | Content                                                               | Why below                                                                |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **System Health**         | DB status (dot), sync status + last backup, total users, branch count | Operational health is secondary to patient safety alerts (Purpose)       |
| **24h Activity**          | Mini histogram of logins/actions by hour, "View audit →"              | Gives Admin a pulse without leaving Home                                 |
| **Pending Admin Actions** | Count of data corrections / sync conflicts needing review             | Only appears when >0 (Agency: don't show chrome that earns no attention) |

---

## 5. Viewer Home — Different Animal

Viewer Home is **not** a dashboard — it's a self-service portal (Simplicity: show the common path first).

```
Viewer (/viewer) — max 640px centered
┌──────────────────────────────┐
│  [ Request Medicine — large primary CTA ]   ← 48px height, branded maroon
│  "X items available" • Browse →
├──────────────────────────────┤
│  My Recent Requests (last 3) │
│  ● Paracetamol — Pending (yellow badge) · 2h ago
│  ● Ibuprofen — Ready to claim (green pulse) · 1h ago
│  empty: "No requests yet" + Browse button
└──────────────────────────────┘
```

- No stat grid (Viewers don't manage inventory — Flexibility: adapt to context).
- Primary CTA uses `motion` press spring (`scale 0.97` on down, `1.0` on up, 100ms) — Response on pointer-down.
- "Ready to claim" uses green _pulsing_ badge (subtle `opacity 0.9→1` at 1.2s ease) — draws attention without modal interruption.
- Content is vertically centered at ≥900px height; top-aligned on short windows to avoid floating island.

---

## 6. Interactions & Motion

| Transition                          | Motion                                                                                       | Apple principle                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Home → Expiry via stat card         | Cross-fade 180ms + preserve scroll (not slide — not a spatial hierarchy shift)               | §14 reduced-motion safe                                               |
| Home alert card hover action reveal | `opacity 0→1` 120ms, no movement                                                             | §1 continuous feedback, not end-only                                  |
| Density toggle Compact↔Comfortable  | Spring `damping 1.0 / 0.25`, card padding animates via `transform` not `height` (compositor) | §4, §11                                                               |
| Sidebar collapse                    | `damping 1.0 / 0.35` width spring, content reflows via `transform`                           | §11 frame smoothness                                                  |
| Offline dot pulse                   | `scale 1→1.3` with opacity fade, 900ms                                                       | §13 causality: dot pulses _when_ connection changes, not continuously |

**Stat card press:** highlight on `pointerdown`, commit on `pointerup` with 10px hysteresis — cancel by dragging away (§10).

---

## 7. Responsive Behavior (Desktop-only, 800×600 min)

| Width      | Behavior                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| `≥1200px`  | Alert band side-by-side, stats 4-col, activity + quick actions side-by-side                                |
| `900–1199` | Alert band stacks vertically (Expiry above Low-stock), stats 4-col, activity full-width then quick actions |
| `800–899`  | Sidebar collapses to 64px icons (auto), alert band stacked, stats 2×2 grid, toast narrows to centered pill |
| `<800`     | N/A — enforce min 800×600 in Tauri window config (`minWidth: 800`)                                         |

Narrow-window chrome uses scroll-edge fade mask, not hard divider (§12).

---

## 8. What This Screen Contains (Checklist)

- [ ] Adaptive density toggle wiring (header)
- [ ] 4 stat cards (Staff) / 7 cards (Admin) with branded heading tokens
- [ ] 2 alert summary cards (top 5 each) + "View All" + empty "All clear"
- [ ] Recent activity feed (10 rows, relative time, accent bar)
- [ ] Quick actions (4 buttons → sheets/palette)
- [ ] Admin health row (3 cards, conditional third)
- [ ] Viewer centered CTA + 3-row recent requests + pulsing badge
- [ ] Sidebar active state + palette entry points on this route

---

## 9. Trade-offs Summary

| Decision               | Why                                                           | What we sacrificed                                                                                            |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Alert-first band       | Safety > stats; expiry kills patients, stats don't            | Stats lose hero position — mitigated by persistent stat row directly below                                    |
| Adaptive density       | Equal Admin/Staff balanced needs + user Agency                | One more control to document/learn — placed in header with clear label, persisted once                        |
| No charts on Home      | Keeps Home triage-fast; Reports owns analytics                | Admin loses at-a-glance trend — compensated by sparklines in stat cards + mini histogram in Admin health card |
| Viewer centered column | Focus over chrome; 640px is thumb-reachable if ever on tablet | Feels different from Staff — intentional: different job, different layout (Flexibility)                       |
