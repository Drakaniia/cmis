# CMIS UI/UX Spec — Index (Apple-Design Guideline)

Interview decisions: Hybrid clinical+fluid chrome · Desktop-only 800×600 min · Full fluid motion · Command-palette nav · Adaptive density · Drag-primary Kanban · Threshold-hint Viewer · Modal wizards · Hybrid split/sheet · Branded headings · Motion (`motion`) allowed · Per-page spec files

Base spec: `docs/spec/CMIS-ui-spec.md` — this `docs/ui/` series **refines** that spec with Apple-design decisions; where they conflict, this series wins.

---

| #   | File                                 | Route(s)                                                                              | Core decision                                                                                                                                                                                                                                              |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00  | `CMIS-UI-00-overview-and-shell.md`   | Global                                                                                | Hybrid material system (opaque field vs translucent chrome), command-palette dominance, adaptive density toggle (Compact/Comfortable), `motion` spring presets, single unified type scale, offline dot+toast                                               |
| 01  | `CMIS-UI-01-home-dashboards.md`      | `/staff` · `/admin` · `/viewer`                                                       | Alert-first band (expiry+low-stock top) over stat hero; Admin health row appended below; Viewer centered 640px CTA column with pulsing Ready badge                                                                                                         |
| 02  | `CMIS-UI-02-inventory-management.md` | `/staff/inventory` · `/admin/inventory`                                               | Hybrid split (≥1200) → sheet (<1200) at 1200px breakpoint; inline scan icon+wedge listener; Stock In 4-step + Stock Out 5-step modal wizards with FEFO batch                                                                                               |
| 03  | `CMIS-UI-03-expiry-alerts.md`        | `/staff/inventory/expiry`                                                             | Table with left-edge time bar + badge+icon (red/orange/yellow), default expiry-asc sort, 24px timeline minimap per month, Dispose/Extend row actions                                                                                                       |
| 04  | `CMIS-UI-04-low-stock-alerts.md`     | `/staff/inventory/low-stock`                                                          | Table with inline quantity fill bar (gap visualization), Gap column, Supplier lead-time hint, Reorder suggestion 2×threshold + grouped-by-supplier bulk, Adjust Threshold popover inline                                                                   |
| 05  | `CMIS-UI-05-request-queue-kanban.md` | `/staff/requests` · `/admin/requests`                                                 | **Hero interaction:** 260px columns, 48px cards, drag physics (hysteresis 10px, presentation-value springs, `0.998` projection, `0.55` rubber-band, velocity handoff), keyboard `Alt+Arrow` with springs, batch toolbar frosted slide-up, collapsed Denied |
| 06  | `CMIS-UI-06-dispensing-log.md`       | `/staff/dispensing` · `/admin/dispensing`                                             | Audit table (Date/Medicine/Batch/Qty/Requestor/Staff/Req Link) with row→modal drill-in, CSV/PDF export scope dialog, denied rows muted, immutability                                                                                                       |
| 07  | `CMIS-UI-07-reports-analytics.md`    | `/staff/reports` · `/admin/reports`                                                   | Filters-first sticky bar + 6-widget grid (Recharts v1, `chart-1..5` tokens), density-aware breakpoints, cross-fade on filter change (no spring bars), branch-compare for Admin                                                                             |
| 08  | `CMIS-UI-08-viewer-portal.md`        | `/viewer` · `/viewer/history` · `/viewer/claims`                                      | Centered list with threshold hints (ample/few left/out) not exact qty, chip filters, 4-step modal wizard from button origin, History card list + Claims Ready prominent+History table                                                                      |
| 09  | `CMIS-UI-09-admin-only.md`           | `/admin/users` · `/admin/settings` · `/admin/audit` · `/admin/data` · `/admin/health` | Users table+sheet/read vs modal/write split; Settings sticky tab bar with H-scroll; Audit expandable inline diff (append-only correction); Data stacked 2-card + Tauri picker+diff; Health 5 cards with sparklines+action row                              |

---

## How to Apply

1. Read `00` first — tokens, motion presets, shell chrome.
2. Per-route implementation reads only its file + `00`; files 01–09 assume `00` without re-deciding it.
3. All motion uses `motion` springs per the preset table in `00 §3` — no ad-hoc durations.
4. Every filter bar is sticky translucent, chips+URL persistence, palette alias — consistent wayfinding.
5. `prefers-reduced-motion / transparency / contrast` per `00 §3.1` applies globally.

## Verification

```bash
# no runtime yet — spec verification is structure
ls docs/ui/*.md | wc -l   # expect 10 incl. README
pnpm dlx ultracite check  # if any .ts touched — not needed for this Markdown-only series
```
