# CMIS UI/UX Spec — 00 Overview & Application Shell

Clinical Inventory Management System — BukSU Clinic | Apple-Design Guideline
Spec ID: CMIS-UI-00 | Depends on: `docs/context/CMIS-01` · `CMIS-02` · `CMIS-03` · `docs/spec/CMIS-ui-spec.md` §2

> **How to read this series:** This file defines the global design language, shell, motion, and typography. Files 01–09 inherit these decisions and only override per-page where justified. Every recommendation references Apple Design principles (§1–§17) and interview decisions (Hybrid chrome, Desktop-only, Full fluid motion, Command-palette nav, Adaptive density, Branded headings).

---

## 1. Design Language — Chosen Direction

### 1.1 The Decision: Hybrid Clinical + Apple Fluid

**Interview choice:** Hybrid — _clinical density for tables/forms, Apple fluid for chrome (sidebar/header/sheets/modals)_.

| Option                                         | Description                                                                                                                                                                            | Trade-offs                                                                                                                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Strict clinical minimal** (spec original) | Flat white, sharp 0px radius, high contrast, no blur                                                                                                                                   | + Maximum data density, sterile trust, cheapest to build. − Feels institutional, no depth hierarchy, motion feels bolted-on, fatiguing over 8-hour shift                                                           |
| **B. Full Apple fluid**                        | Translucent blurred chrome, 16–20px radius, layered depth, spring everywhere                                                                                                           | + Warm, modern, delightful; depth telegraphs hierarchy. − Reduces table rows per viewport, blur costs GPU, can feel "consumer" not clinical                                                                        |
| **C. Hybrid (RECOMMENDED)**                    | **Tables/forms stay clinical** (tight 0–8px radius, dense, neutral field); **Chrome is fluid** (header/sidebar/sheets/modals are translucent `backdrop-filter` materials with springs) | + Staff gets density where it counts + delight where it rests the eye; Admin analytics stay scannable; Viewer feels approachable. − Two visual vocabularies to maintain — mitigated by token discipline (see §1.3) |

**Rationale:** CMIS is _equal-priority_ (Admin oversight ≈ Staff counter speed). Both roles stare at tables for hours — density wins there (Purpose, Simplicity). Chrome is where wayfinding, safety, and delight live — translucency there earns its keep (Craft, Familiarity).

### 1.2 Material System

| Surface                             | Material                                                                                                   | Token                  | When it floats                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| **Top header**                      | Light translucent, 60% white + `blur(20px) saturate(180%)`, hairline top highlight `rgba(255,255,255,0.4)` | `--chrome-translucent` | Content scrolls underneath (§12)                                                     |
| **Sidebar**                         | Heavier material, 85% white + `blur(12px)`, stronger shadow (`0 8px 32px rgba(0,0,0,0.12)`)                | `--chrome-heavy`       | Heavier = structural, lighter = interactive (§12: Material weight encodes hierarchy) |
| **Sheets / modals / detail panels** | Frosted card, 72% white + `blur(16px)`, scale+blur enter (§12: Materialize, don't just fade)               | `--surface-frosted`    | Dim scrim `rgba(0,0,0,0.32)` behind modal tasks; no scrim for parallel sheets        |
| **Tables / forms field**            | Opaque `var(--card)`, 0–8px radius, `border: 1px solid var(--border)`                                      | `--field-opaque`       | Never translucent on translucent (legibility collapse)                               |

**Never:** stack light translucent on light translucent. Brass tacks: table inside a translucent sheet is opaque.

**Shadow as hierarchy:** heavier over busy text content, lighter over plain backgrounds (context-aware). Bigger surfaces (sheets) get deeper shadow than chips.

### 1.3 Shape & Radius

- **Field elements** (table rows, inputs, table cards): `radius: 6--8px` (`--radius-sm/md`) — clinical, stackable, sharp-readable.
- **Chrome** (header, sidebar, sheets, modals, Kanban cards): `radius: 12--16px` (`--radius-lg/xl`) — touchable, modern, distinct from field.
- **No 0px sharp edges** anywhere except 1px dividers and table grid lines. The "sharp clinical" is carried by _density and contrast_, not by literal corners.

### 1.4 Color — Branded Headings (Interview choice)

| Option                                     | Trade-offs                                                                                                                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neutral + status-only accent               | Most clinical trust, but undifferentiated from any SaaS                                                                                                                                                         |
| **Branded palette headings (RECOMMENDED)** | BukSU maroon/gold as `primary`/`chart` accents; headings in `foreground` with maroon underline/accent bar; saturated status hues (green/orange/red) remain the _only other_ saturated signals — wayfinding pops |
| Monochrome + single blue                   | Minimal but erases institutional identity                                                                                                                                                                       |

**Token mapping:** `--primary: oklch(0.35 0.14 25)` (maroon anchor, tune to BukSU brand book), `--chart-1..5` gold/amber complements. Status stays `destructive`/`warning`/`success` — not recolored to brand.

---

## 2. Application Shell & Navigation

### 2.1 Shell Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Header (translucent, 48px, backdrop-blur)  [Branch ▼] [⌘K] [⚙][🌙][role·offline-dot] │
├──────────────┬───────────────────────────────────────────────┤
│ Sidebar      │  Main Content (scrolls under header)          │
│ (heavy       │  density-aware: Compact / Comfortable toggle  │
│  material,   │  in header (adaptive density choice)         │
│  240px)      │                                               │
│              │                                               │
└──────────────┴───────────────────────────────────────────────┘
```

- **Header height 48px** (not 64 — preserves table rows; Agency: doesn't steal vertical budget).
- **Sidebar 240px expanded / 64px icon-only collapsed.** Heavier material than header to signal structure (§12).
- **Content scrolls under header** — header is _not_ an opaque bar consuming a strip; scroll-edge fade mask (8px blur gradient) where content meets header, not a 1px hard divider.

### 2.2 Navigation Options & Recommendation

| Option                                                          | Trade-offs                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Sidebar + header (spec original)                             | Familiar, role-grouped, but duplicates chrome at narrow widths                                                                                                                                                                                                                                                                              |
| B. Sidebar-only (header removed)                                | Saves 48px but loses global branch context visibility; branch selector buried                                                                                                                                                                                                                                                               |
| **C. Command-palette dominant (RECOMMENDED, interview choice)** | **Sidebar stays** (grouped sections, collapsible per §2.3 of spec) **+ header keeps branch selector + adds `⌘K` palette trigger.** Primary nav is sidebar for browsing, palette for _doing_ (jump to Inventory/Requests/Stock In, filter presets). Best for desktop power users without sacrificing discoverability (Familiarity + Agency). |

**Palette behavior (§2.1 Response, §12):**

- `Cmd/Ctrl+K` opens a translucent command sheet anchored to header center (transform-origin: header center).
- Lists: navigation, recent items, quick actions ("Stock In", "Scan Item"), filter presets. Fuzzy search.
- Appears with `damping 1.0 / response 0.3` spring + blur materialize (scale 0.98→1 + blur 0→16).
- Keyboard-first, pointer-secondary (Flexibility).

**Branch selector:** stays in header (global). Staff sees assigned branch default; Admin sees all. Hidden for Viewer. Changing branch cross-fades content (150ms opacity), not a slide — avoids implying spatial movement between equivalent datasets.

### 2.3 Density Toggle (Interview choice: Adaptive)

Header trailing cluster: `[Density: Compact ● Comfortable] [Branch ▼] [⌘K] [ModeToggle] [Role badge · offline-dot]`

| Density         | Row height                     | Card padding   | Leading                                               | When to use |
| --------------- | ------------------------------ | -------------- | ----------------------------------------------------- | ----------- |
| **Compact**     | 44px table rows, 12px card pad | `leading 1.35` | Staff mid-shift scanning many rows; Admin audit sweep |
| **Comfortable** | 56px rows, 20px card pad       | `leading 1.5`  | Morning triage, Viewer browsing, reports reading      |

Persisted to `tauri-plugin-store` (`ui:density`). Resizable panels (§7 in spec) respect the same toggle — divider hit area stays 12px with 4px visible line for pointer ease.

### 2.4 Offline Indicator (Interview: subtle dot + toast)

| Option                               | Trade-offs                                                                                                                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prominent full-width banner          | Impossible to miss, but consumes 32px and induces banner blindness                                                                                                                                                                                                 |
| **Subtle dot + toast (RECOMMENDED)** | Header role badge gets a 8px dot: green (synced) / amber (syncing) / red (offline) with pulse on change + single toast "Offline — changes queued locally (N pending)" / "Re-connected — synced N records". Calm, Apple-like (§13 Utility: only meaningful moments) |
| Header material shift                | Too subtle; staff misses offline state during counter rush                                                                                                                                                                                                         |

Offline dot lives _inside_ header translucent material, not an extra bar (§12: don't stack chrome).

---

## 3. Motion System — Full Fluid (Interview choice)

> Full fluid motion, but _earn each spring_. Default is critically damped; bounce is reserved for momentum (§4).

| Interaction                                                    | Damping | Response | Notes                                                    |
| -------------------------------------------------------------- | ------- | -------- | -------------------------------------------------------- |
| **Default chrome** (sidebar collapse, header palette, toggles) | `1.0`   | `0.35`   | No overshoot — graceful (recommended default)            |
| **Sheets / modals** (detail sheet, stock wizard)               | `1.0`   | `0.30`   | Materialize: blur+scale together (§12)                   |
| **Kanban drag → spring**                                       | `0.8`   | `0.30`   | Only when flick velocity exists; otherwise 1.0           |
| **Density switch**                                             | `1.0`   | `0.25`   | Shorter — feels like chrome tightening/loosening         |
| **Toast**                                                      | `1.0`   | `0.30`   | Slide + fade from header origin (spatial consistency §7) |

**Principles applied:**

- §1 Response: feedback on `pointerdown` (button `scale 0.97` in 100ms) — never wait for release.
- §3 Interruptibility: all springs retarget from _presentation value_; never lock input during transition; use Motion (`animate` with `type: spring, bounce`) not CSS transitions for gesture-driven surfaces.
- §5 Velocity handoff / §6 Projection: Kanban cards (see 05 spec) project resting column from release velocity.
- §9 Rubber-banding at window/panel edges (progressive resistance, not hard stop).
- §11 Compositor only: animate `transform` + `opacity` + `backdrop-filter: blur` (GPU), `will-change` where imminent.

**Dependency:** `motion` (Framer Motion successor) — justified: only library that does interruptible springs, velocity handoff, and blur/transform co-animation correctly. No alternative without hand-rolling `requestAnimationFrame`.

### 3.1 Reduced Motion & Transparency

```css
@media (prefers-reduced-motion: reduce) {
  .sheet,
  .kanban-card {
    transition: opacity 180ms ease;
    transform: none !important;
  }
  /* drop bounce, keep comprehension aids */
}
@media (prefers-reduced-transparency: reduce) {
  .header,
  .sidebar,
  .sheet {
    background: var(--card);
    backdrop-filter: none;
  }
}
@media (prefers-contrast: more) {
  .header,
  .sheet {
    background: var(--card);
    border: 1.5px solid var(--border);
  }
}
```

Large moving objects fade to 0.7 opacity while traveling; avoid full-viewport motion and 0.2 Hz oscillations (§14).

---

## 4. Typography — Single Unified Scale (Interview choice)

**Choice:** Single unified scale (not role-tuned, not density-linked). Density toggle already handles breathing room; a second typographic variable would fight it.

| Token     | Size (clamp)                      | Leading | Tracking  | Usage                                                                |
| --------- | --------------------------------- | ------- | --------- | -------------------------------------------------------------------- |
| `display` | `clamp(1.75rem, 3vw, 2.5rem)`     | `1.05`  | `-0.02em` | Home stat numbers, page titles — tighten as it grows (§15)           |
| `heading` | `clamp(1.125rem, 1.5vw, 1.35rem)` | `1.2`   | `-0.01em` | Card titles, column headers, modal titles                            |
| `body`    | `0.9375rem` (15px)                | `1.5`   | `0`       | Table cells, form labels, prose — near 0 tracking (§15)              |
| `caption` | `0.8125rem`                       | `1.4`   | `0.01em`  | Timestamps, helper text, badge text — slight positive for legibility |

- **System font first:** `font: 100%/1.5 system-ui, "Inter Variable", sans-serif` — optical sizing already tuned. No custom display face without reason.
- **Weight for hierarchy, not size alone:** Emphasize with `font-weight 600` before bumping size (§15).
- **Dynamic type respect:** spacing in `rem`, not fixed `px`; layout scales with user text size.

---

## 5. Global Components & Tokens

### 5.1 Toast System (from spec §8)

| Event                    | Type                            | Message origin                    | Material                                               |
| ------------------------ | ------------------------------- | --------------------------------- | ------------------------------------------------------ |
| Login summary            | info (persistent until dismiss) | "3 expiring in 30d · 2 low stock" | Frosted card, slides from header (§7: anchored origin) |
| Stock in/out             | success                         | "Logged: [Item] +[Qty]"           | Default                                                |
| Request received (Staff) | info                            | "New: [Name] — [Medicine]"        | With `View` action                                     |
| Ready to claim (Viewer)  | success persistent              | "Ready at [Branch]!"              | Green accent border                                    |
| Offline/online           | warning/success                 | per §2.4                          | With pending count                                     |

No stacking light-on-light toasts on translucent surfaces.

### 5.2 Resizable Panels (§7 spec, extended)

- Default 40/60, min 25/75, persisted to `panel-ratio`.
- At `<1200px` auto-collapses to **sheet fallback** (see per-page specs) — no 25% sliver where neither panel is usable.
- Divider: 12px hit area, 4px visible line, `cursor: col-resize`, drag uses direct manipulation (§2: respect grab offset, `setPointerCapture`).

### 5.3 Wayfinding & Accessibility (Apple §16)

- Every screen answers: Where am I? (header breadcrumb + sidebar active state), Where can I go? (sidebar + palette), What's there? (empty states per spec §9), How do I get out? (Escape always works, never trap).
- Focus: visible 2px ring (`ring` token), trapped only inside modals, restored on close.
- Status badges pair color+text+icon, `aria-label` included.
- `Skip to content` link for sidebar bypass.

---

## 6. What This File Unlocks

Files 01–09 can now assume:

- Hybrid material tokens, 00 §1.2
- Palette nav + branch in header, density toggle, offline dot (§2)
- Motion presets table (§3)
- Unified type scale (§4)
- Toast + panel conventions (§5)

No per-page spec should re-decide these — only override with explicit rationale.

---

## 7. Open Decisions Deferred to Per-Page Specs

- Expiry status color thresholds (30/90 days) — see 03.
- Kanban drag physics details (projection, rubber-band constant) — see 05.
- Viewer quantity disclosure wording ("ample / few left") — see 08.
- Stock wizard step count & validation — see 02.
