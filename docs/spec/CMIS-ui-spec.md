# CMIS — UI/UX Specification

Clinical Inventory Management System — Bukidnon State University

---

## 1. Overview

This document specifies the **user interface, page structure, navigation, user flows, and screen inventory** for the CMIS desktop application. It is a Tauri 2 app (React frontend + Rust backend) targeting a single-user, auto-login local desktop experience.

**Design philosophy:** Clinical / clean minimal — white/neutral backgrounds, high contrast, generous whitespace, sharp edges (no rounded corners), tight data density. Follows the existing `packages/ui` design system.

---

## 2. Global Application Shell

### 2.1 Layout Structure

```
┌──────────────────────────────────────────────────┐
│  Header (top bar)                                │
│  [Branch Selector ▼]     [Module Nav]   [⚙] [🌙]│
├──────────┬───────────────────────────────────────┤
│          │                                       │
│ Sidebar  │  Main Content Area                    │
│ (left)   │  (multi-panel, resizable split)       │
│          │                                       │
│          │                                       │
│          │                                       │
└──────────┴───────────────────────────────────────┘
```

- **Top Header Bar:** Application title ("CMIS"), global branch selector dropdown (right-aligned), theme toggle (dark/light), and user role indicator.
- **Left Sidebar:** Vertical grouped navigation with sections. Collapsible per-section or fully collapsible to icon-only mode.
- **Main Content Area:** Multi-panel layout. When a list+detail view is active, the content splits into a **list panel** (left) and **detail panel** (right), with a **draggable resize divider**. Panel ratio preference is saved to local storage.

### 2.2 Header Bar

| Element         | Behavior                                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App title/logo  | "CMIS" text or logo. Non-clickable.                                                                                                                                         |
| Branch selector | Global `<select>` dropdown. Switches all views to show data for the selected branch. Defaults to user's assigned branch (Staff) or first branch (Admin). Hidden for Viewer. |
| User role badge | Small badge showing current role (Admin / Staff / Viewer). Auto-login, single-user.                                                                                         |
| Theme toggle    | Dark/light mode toggle (existing `ModeToggle` component).                                                                                                                   |
| Settings icon   | Gear icon → opens Settings screen (Admin only).                                                                                                                             |

### 2.3 Sidebar Navigation

The sidebar is divided into **logical sections** with clear visual separators. Navigation items change based on the active role.

#### Admin Sidebar

| Section            | Nav Item             | Icon              | Route                        |
| ------------------ | -------------------- | ----------------- | ---------------------------- |
| **Overview**       | Home (System Health) | `LayoutDashboard` | `/admin`                     |
| **Inventory**      | Stock Management     | `Package`         | `/admin/inventory`           |
|                    | Expiry Alerts        | `AlertTriangle`   | `/admin/inventory/expiry`    |
|                    | Low-Stock Alerts     | `AlertCircle`     | `/admin/inventory/low-stock` |
| **Requests**       | Request Queue        | `ClipboardList`   | `/admin/requests`            |
|                    | Dispensing Log       | `ClipboardCheck`  | `/admin/dispensing`          |
| **Reports**        | Reports & Analytics  | `BarChart3`       | `/admin/reports`             |
| **Administration** | User Management      | `Users`           | `/admin/users`               |
|                    | System Settings      | `Settings`        | `/admin/settings`            |
|                    | Audit Logs           | `ScrollText`      | `/admin/audit`               |
|                    | Data Export/Import   | `Download`        | `/admin/data`                |
|                    | System Health        | `Activity`        | `/admin/health`              |

#### Staff Sidebar

| Section       | Nav Item            | Icon              | Route                        |
| ------------- | ------------------- | ----------------- | ---------------------------- |
| **Overview**  | Home (Dashboard)    | `LayoutDashboard` | `/staff`                     |
| **Inventory** | Stock Management    | `Package`         | `/staff/inventory`           |
|               | Expiry Alerts       | `AlertTriangle`   | `/staff/inventory/expiry`    |
|               | Low-Stock Alerts    | `AlertCircle`     | `/staff/inventory/low-stock` |
| **Requests**  | Request Queue       | `ClipboardList`   | `/staff/requests`            |
|               | Dispensing Log      | `ClipboardCheck`  | `/staff/dispensing`          |
| **Reports**   | Reports & Analytics | `BarChart3`       | `/staff/reports`             |

#### Viewer Sidebar

| Section         | Nav Item        | Icon          | Route             |
| --------------- | --------------- | ------------- | ----------------- |
| **Home**        | Browse Medicine | `Search`      | `/viewer`         |
| **My Requests** | Request History | `FileText`    | `/viewer/history` |
|                 | Claim Status    | `CheckCircle` | `/viewer/claims`  |

---

## 3. Screen Inventory & Descriptions

### 3.1 Home Screens (Role-Adaptive)

Each role lands on a role-specific home screen after auto-login.

#### Staff Home (`/staff`)

**Purpose:** Daily operations overview — what needs attention today.

**Layout:** Dashboard grid of stat cards + alert summaries.

| Widget              | Content                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Stats Row**       | 4 stat cards: Total Items, Low Stock Count, Pending Requests, Expiring Soon (next 30 days)                  |
| **Alerts Summary**  | Compact list of top 5 expiry alerts + top 5 low-stock alerts. "View All" link to full alert screens.        |
| **Recent Activity** | Feed of last 10 actions (stock in, stock out, request received, item dispensed). Timestamp + user + action. |
| **Quick Actions**   | Button row: "Stock In", "Stock Out", "Scan Item", "View Requests" — shortcuts to key actions.               |

#### Admin Home (`/admin`)

**Purpose:** System health + all Staff dashboard features.

**Layout:** Same as Staff Home, plus additional system-level widgets.

| Widget                    | Content                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| **Staff Home widgets**    | All Staff Home content above                                      |
| **System Health Card**    | DB status, sync status, last backup, total users, active branches |
| **User Activity**         | Summary of user logins and actions in the last 24 hours           |
| **Pending Admin Actions** | Items needing admin attention (if any)                            |

#### Viewer Home (`/viewer`)

**Purpose:** Quick access to browse and request medicine.

**Layout:** Simple, focused — minimal chrome, centered content.

| Widget                 | Content                                                    |
| ---------------------- | ---------------------------------------------------------- |
| **Quick Request CTA**  | Prominent "Request Medicine" button → goes to request flow |
| **Available Medicine** | Compact summary: "X items available", link to browse       |
| **My Recent Requests** | Last 3 requests with status (Pending / Approved / Claimed) |

---

### 3.2 Inventory Module (Staff & Admin)

#### 3.2.1 Stock Management (`/staff/inventory`, `/admin/inventory`)

**Purpose:** Browse, search, and manage all medicine items in inventory.

**Layout:** Hybrid **multi-panel** — resizable split.

```
┌────────────────────────┬──────────────────────────┐
│  List Panel (40-60%)   │  Detail Panel (40-60%)   │
│                        │                          │
│  [Search bar]          │  Medicine Name           │
│  [Category filter ▼]   │  ─────────────────────   │
│  [Status filter ▼]     │  SKU: xxx                │
│  [Branch filter ▼]     │  Category: xxx           │
│                        │  Batch #: xxx            │
│  Name        Status    │  Expiry: 2026-12-01      │
│  ───────────────────── │  Qty: 50                 │
│  Paracetamol  ● In     │  Supplier: xxx           │
│  Amoxicillin  ● In     │                          │
│  Ibuprofen    ○ Out    │  [Stock In] [Stock Out]  │
│  ...                   │  [Edit] [History]        │
│                        │                          │
│                        │  ── Dispensing History ──│
│                        │  Date | Qty | Requestor  │
└────────────────────────┴──────────────────────────┘
  ← draggable divider →
```

**List Panel:**

- Search bar: searches by name, SKU, batch number.
- Category filter: dropdown (Analgesics, Antibiotics, etc.).
- Status filter: In Stock / Out of Stock / Low Stock / Expiring Soon.
- Branch filter: when multi-branch is active.
- Sortable table columns: Name, SKU, Category, Qty, Expiry, Status.
- Click a row → loads detail in right panel.

**Detail Panel:**

- Shows full item details when selected.
- Action buttons: Stock In, Stock Out, Edit Item, View History.
- Dispensing history table: recent dispensing records for this item.
- When no item selected: detail panel shows placeholder ("Select an item to view details").

**Empty state:** When no items match filters, show `Empty` component with message and "Add First Item" CTA.

#### 3.2.2 Stock In Flow

**Trigger:** "Stock In" button (from inventory detail panel, home quick actions, or sidebar).

**Layout:** Linear form (step-by-step) in a modal or dedicated page.

**Steps:**

1. **Step 1 — Identify Item**
   - Barcode/QR scan input (always-on, auto-focused) OR manual SKU entry.
   - System looks up item. If found → pre-fill next steps. If not found → prompt to create new item.

2. **Step 2 — Item Details (pre-filled if scanned)**
   - Item name (read-only if existing, editable if new).
   - Category (dropdown).
   - Unit of measure.

3. **Step 3 — Batch Information**
   - Batch/Lot number (text input).
   - Expiry date (date picker).
   - Quantity received (number input).
   - Supplier (dropdown, editable).
   - Notes (optional textarea).

4. **Step 4 — Review & Submit**
   - Summary of all entered data.
   - "Confirm Stock In" button.
   - Success toast → return to inventory.

**Validation:** Required fields: item identifier, batch number, expiry date, quantity, supplier.

#### 3.2.3 Stock Out Flow

**Trigger:** "Stock Out" button.

**Layout:** Linear form (similar to Stock In).

**Steps:**

1. **Identify Item** — scan or search.
2. **Reason** — dropdown: Dispensed, Disposed (expired), Damaged, Transferred, Other.
3. **Quantity** — number input (cannot exceed available).
4. **Notes** — optional.
5. **Review & Confirm.**

#### 3.2.4 Expiry Alerts (`/staff/inventory/expiry`, `/admin/inventory/expiry`)

**Purpose:** Show all items approaching or past expiry.

**Layout:** Filterable table.

| Column      | Description                                                                      |
| ----------- | -------------------------------------------------------------------------------- |
| Item Name   | Medicine name                                                                    |
| SKU         | Stock keeping unit                                                               |
| Batch #     | Lot number                                                                       |
| Expiry Date | Date (highlight red if past, orange if within 30 days, yellow if within 90 days) |
| Quantity    | Current stock                                                                    |
| Status      | "Expired" / "Expiring Soon" / "Expiring Later"                                   |

**Filters:** Date range, branch, status category.

**Actions per row:** Dispose, Extend (if batch re-tested), View Details.

**Toast on login:** If any items are expiring within 30 days, show a toast notification summarizing count.

#### 3.2.5 Low-Stock Alerts (`/staff/inventory/low-stock`, `/admin/inventory/low-stock`)

**Purpose:** Show all items below reorder threshold.

**Layout:** Same table structure as expiry alerts.

| Column      | Description                                 |
| ----------- | ------------------------------------------- |
| Item Name   | Medicine name                               |
| SKU         | Stock keeping unit                          |
| Current Qty | Current stock level                         |
| Threshold   | Reorder threshold                           |
| Status      | "Out of Stock" (red) / "Low Stock" (orange) |
| Supplier    | Default supplier                            |

**Actions per row:** Reorder (create purchase order), View Details, Adjust Threshold.

**Toast on login:** Summary count of low-stock items.

---

### 3.3 Requests Module (Staff & Admin)

#### 3.3.1 Request Queue — Kanban Board (`/staff/requests`, `/admin/requests`)

**Purpose:** Manage incoming medicine requests from Viewers. The Kanban board is the primary workspace for request processing.

**Layout:** Horizontal Kanban board with 4 columns, a persistent filter bar at the top, and a batch action toolbar that appears when cards are selected.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [🔍 Search...] [Date Range ▼] [Branch ▼] [Category ▼] [Requestor ▼]      │
├───────────────┬───────────────┬───────────────┬───────────────┬─────────────┤
│  Pending (3)  │ Approved (1)  │ Ready (2)     │ Claimed (1)   │  Denied (0) │
├───────────────┼───────────────┼───────────────┼───────────────┼─────────────┤
│ ┌───────────┐ │ ┌───────────┐ │ ┌───────────┐ │ ┌───────────┐ │             │
│ │ ☐ Maria S │ │ │ ☐ John D  │ │ │ ☐ Ana R   │ │ │ ☐ Ben T   │ │  (collapsed)│
│ │ Paracetamol│ │ │ Amoxicillin│ │ │ Ibuprofen │ │ │ Paracetamol│ │  click to  │
│ │ 2 tabs    │ │ │ 10 caps   │ │ │ 1 pack    │ │ │ 5 tabs    │ │  expand    │
│ │    2h ago │ │ │   30m ago │ │ │   1h ago  │ │ │  claimed  │ │             │
│ │     [⋯]   │ │ │     [⋯]   │ │ │     [⋯]   │ │ │     [⋯]   │ │             │
│ └───────────┘ │ └───────────┘ │ └───────────┘ │ └───────────┘ │             │
│ ┌───────────┐ │               │ ┌───────────┐ │               │             │
│ │ ☐ Carlo M │ │               │ │ ☐ Liza P  │ │               │             │
│ │ Ibuprofen │ │               │ │ Paracetamol│ │               │             │
│ │ 1 strip   │ │               │ │ 3 packs   │ │               │             │
│ │   45m ago │ │               │ │   20m ago │ │               │             │
│ │     [⋯]   │ │               │ │     [⋯]   │ │               │             │
│ └───────────┘ │               │ └───────────┘ │               │             │
└───────────────┴───────────────┴───────────────┴───────────────┴─────────────┘
                          ↑ drag-and-drop ↑
┌─────────────────────────────────────────────────────────────────────────────┐
│ ☑ 2 selected  [Approve] [Deny] [Dispense] [Move to Ready] [Clear Selection]│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

##### Columns

| #   | Column             | Description                                                                                    | Card Count Badge        |
| --- | ------------------ | ---------------------------------------------------------------------------------------------- | ----------------------- |
| 1   | **Pending**        | New requests awaiting staff review. Default landing column for all new requests.               | Yellow badge with count |
| 2   | **Approved**       | Staff has approved the request. Item is being located/prepared.                                | Blue badge with count   |
| 3   | **Ready to Claim** | Item is prepared at the counter. Viewer has been notified via toast.                           | Green badge with count  |
| 4   | **Claimed**        | Viewer has claimed the medicine. Dispensing record created. Cards auto-archive after 24 hours. | Gray badge with count   |
| 5   | **Denied**         | Requests rejected by staff. Collapsed by default (click to expand). Not part of the main flow. | Red badge with count    |

---

##### Card Design (Compact)

Each card is a **compact row** — minimal vertical height to maximize the number of visible cards.

```
┌─────────────────────────┐
│ ☐ Maria S.          2h  │
│ Paracetamol 500mg       │
│ 2 tabs    [Request →]   │
│                     [⋯] │
└─────────────────────────┘
```

| Element                 | Description                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| **Checkbox**            | Left side. Enables multi-select for batch actions. Visible on hover or when any card is selected. |
| **Requestor name**      | Bold. Truncated if too long. Tooltip shows full name + student/staff ID.                          |
| **Relative time**       | Right-aligned top. "2h ago", "30m ago", "just now".                                               |
| **Medicine + strength** | Line below name. Shows medicine name and dosage form.                                             |
| **Quantity**            | Number + unit (e.g., "2 tabs", "10 caps", "1 strip").                                             |
| **Action button (⋯)**   | Right-aligned bottom. Opens a dropdown menu with context-specific actions.                        |

**Card height:** ~48-52px. Cards stack vertically within each column. Columns scroll independently if overflow.

---

##### Drag-and-Drop Behavior

**Primary interaction:** Drag-and-drop cards between columns to transition request status.

| Aspect                | Behavior                                                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Movement**          | **Free movement between any adjacent columns.** Cards can move left or right (Pending ↔ Approved ↔ Ready ↔ Claimed). This supports corrections and edge cases (e.g., re-opening a Claimed request).             |
| **Drag initiation**   | Click and hold on the card body (not the checkbox or ⋯ button). Card lifts with a subtle shadow and slight scale.                                                                                               |
| **Visual feedback**   | The card being dragged becomes semi-transparent (opacity 0.6). Valid target columns receive a **subtle highlight** (e.g., light blue background with dashed border). Invalid targets are dimmed slightly.       |
| **Drop indicator**    | Within the target column, a **dashed placeholder line** shows exactly where the card will land (above or below existing cards based on cursor position).                                                        |
| **Drop confirmation** | On release: card animates into position. If moving to "Claimed", a brief toast confirms: "Dispensing logged for [Medicine]".                                                                                    |
| **Cancel drag**       | Press `Escape` during drag, or drag outside any column → card returns to original position with no change.                                                                                                      |
| **Denied column**     | Cards can be dragged into the Denied column from Pending or Approved. From Denied, cards can be dragged back to Pending (re-open). Cards in Claimed cannot be dragged to Denied (use the detail view for that). |

**Forbidden transitions (enforced):**

- Claimed → Denied (must go through detail view for audit trail)
- Claimed → Pending (already completed)
- Denied → Claimed (must be re-opened first)

---

##### Button Menu (⋯) — Per-Card Actions

Each card has a `⋯` button that opens a context dropdown menu. The available actions depend on the card's current column.

| Current Column     | Available Actions                                            |
| ------------------ | ------------------------------------------------------------ |
| **Pending**        | View Details, Approve, Deny, Move to Approved, Move to Ready |
| **Approved**       | View Details, Prepare (Move to Ready), Move to Pending, Deny |
| **Ready to Claim** | View Details, Dispense (Move to Claimed), Move to Approved   |
| **Claimed**        | View Details, View Dispensing Record                         |
| **Denied**         | View Details, Re-open (Move to Pending)                      |

**Menu behavior:**

- Opens on click, closes on click outside or `Escape`.
- First item is always "View Details" (opens request detail modal).
- Destructive actions (Deny) are styled in red.
- Divider line separates View Details from status-change actions.

---

##### Keyboard Navigation & Alternatives

The Kanban board must be fully usable without a mouse.

| Action                   | Keyboard Shortcut                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Focus a card**         | `Tab` / `Shift+Tab` to move between cards. Cards are focused in reading order (top-to-bottom, left-to-right across columns). |
| **Select focused card**  | `Space` — toggles checkbox selection. Enables batch actions.                                                                 |
| **Open card detail**     | `Enter` — opens request detail modal.                                                                                        |
| **Open action menu**     | `Shift+F10` or `Application Key` — opens the ⋯ dropdown for the focused card.                                                |
| **Move card left**       | `Alt+ArrowLeft` — moves focused card to the previous column. Disabled if at first column or forbidden transition.            |
| **Move card right**      | `Alt+ArrowRight` — moves focused card to the next column. Disabled if at last column or forbidden transition.                |
| **Select all in column** | `Ctrl+A` when a column is focused — selects all cards in that column.                                                        |
| **Clear selection**      | `Escape` — clears all selected cards. Also closes any open menu/modal.                                                       |
| **Navigate columns**     | `Alt+ArrowLeft/Right` when no card is focused — moves focus between column headers.                                          |

**Focus indicator:** Focused card shows a visible ring outline (2px solid, theme accent color). Focus is trapped within the Kanban board area.

**Screen reader support:** Each card announces: "[Requestor Name], [Medicine], [Quantity], [Status], [Time since request]". Column headers announce their name and card count. Drag operations announce: "Moved [Requestor] from [Source] to [Destination]."

---

##### Multi-Select & Batch Actions

**Selection mechanism:**

- Checkbox appears on each card (visible on hover, or always when any card is selected).
- Click checkbox to toggle selection. `Space` on focused card toggles selection.
- Selected cards show a checked checkbox and subtle highlight background.

**Batch action toolbar:**

- Appears at the bottom of the board when ≥1 card is selected.
- Shows count: "3 selected".
- Available batch actions depend on whether all selected cards are in the same column or mixed.

| Scenario                     | Available Batch Actions                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| **All selected in Pending**  | Approve All, Deny All                                                                |
| **All selected in Approved** | Prepare All (→ Ready), Move All to Pending, Deny All                                 |
| **All selected in Ready**    | Dispense All (→ Claimed), Move All to Approved                                       |
| **Mixed columns**            | Only "Deny" and "Clear Selection" available (if any Pending/Approved cards selected) |

**Batch deny flow:** Opens a modal with:

- Reason dropdown: Out of Stock, Not Available, Duplicate Request, Other.
- Optional note textarea.
- "Deny [N] Requests" button (destructive style).
- Cancel button.

**Batch approve/prepare/dispense flow:** Confirmation dialog:

- "Approve [N] requests?"
- Confirm / Cancel buttons.
- No modal for batch dispense if all items are confirmed in stock; otherwise shows a warning listing items with insufficient stock.

---

##### Filter Bar

A persistent horizontal filter bar sits above the Kanban columns.

| Filter         | Type                           | Behavior                                                                                                            |
| -------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Search**     | Text input with search icon    | Searches requestor name, student/staff ID, and medicine name. Real-time filtering as user types.                    |
| **Date Range** | Dropdown with presets + custom | Presets: Today, Last 7 days, Last 30 days, All Time. Custom: date range picker. Filters by request submission date. |
| **Branch**     | Dropdown                       | Filter by branch (if multi-branch). Shows all branches or a specific branch.                                        |
| **Category**   | Dropdown                       | Filter by medicine category (Analgesics, Antibiotics, etc.). Only shows categories with active requests.            |
| **Requestor**  | Text input                     | Search by requestor name or ID. Useful for finding a specific person's requests.                                    |

**Filter behavior:**

- Filters apply across all columns simultaneously.
- Active filters shown as removable chips/tags below the filter bar.
- "Clear all" link to reset all filters.
- Filter state persists in the URL (bookmarkable).
- Column card counts update to reflect filtered results (e.g., "Pending (2 of 5)").

---

##### Denied Requests — Separate View

Denied requests are **removed from the main Kanban board** and accessible via:

1. **Collapsed column** — The "Denied" column header is always visible on the far right. Click to expand/collapse. Shows count badge. When collapsed, takes minimal width (~48px). When expanded, shows denied cards like other columns.

2. **Filter toggle** — A "Show Denied" toggle in the filter bar. When enabled, denied cards appear in a 5th column.

3. **Dispensing Log** — Denied requests also appear in the Dispensing Log with status "Denied".

**Re-opening a denied request:** Staff can drag a denied card back to Pending, or use the card's ⋯ menu → "Re-open". This creates an audit log entry: "Request [ID] re-opened by [Staff]".

---

##### Empty States

| State                                | Display                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **No requests at all**               | Centered illustration + "No requests yet. When students/staff submit medicine requests, they'll appear here." |
| **No requests matching filters**     | "No requests match your current filters. Try adjusting your search or filters." + "Clear Filters" button      |
| **Column empty (others have cards)** | Subtle placeholder in empty column: "No [status] requests" with dashed border box.                            |
| **All columns empty**                | Board-wide empty state with illustration + text.                                                              |

#### 3.3.2 Request Detail View

**Trigger:** Clicking a Kanban card (or "View Details" from the card's ⋯ menu).

**Layout:** Modal overlay (not a separate page). Keeps the Kanban board visible in the background for context.

```
┌─────────────────────────────────────────────────┐
│ Request Details                          [✕]    │
├─────────────────────────────────────────────────┤
│                                                 │
│  Requestor                                      │
│  Maria Santos — STU-2024-0831                   │
│  maria.santos@bukidnon.edu                      │
│                                                 │
│  Request                                        │
│  Paracetamol 500mg — Analgesic                  │
│  Quantity: 2 tablets                            │
│  Reason: Severe headache since yesterday morning│
│  Submitted: Sep 12, 2026 at 2:15 PM             │
│                                                 │
│  Status: Pending                                │
│  ─────────────────────────────────────────────  │
│  Status History                                 │
│  ● Sep 12, 2:15 PM — Request submitted         │
│                                                 │
│  ┌─────────────────────────────────────────────┐│
│  │ Internal Notes                              ││
│  │ [Add a note...]                             ││
│  └─────────────────────────────────────────────┘│
│                                                 │
│  ┌─────────────────────────────────────────────┐│
│  │ Dispensing Record (auto-created on dispense)││
│  │ Date: —                                     ││
│  │ Staff: —                                    ││
│  │ Batch Used: —                               ││
│  │ Quantity Dispensed: —                       ││
│  └─────────────────────────────────────────────┘│
│                                                 │
│  [Deny]                    [Approve → Ready]    │
└─────────────────────────────────────────────────┘
```

**Modal fields:**

| Section               | Field          | Description                                                                                     |
| --------------------- | -------------- | ----------------------------------------------------------------------------------------------- |
| **Requestor**         | Name + ID      | Full name, student/staff ID number                                                              |
|                       | Email          | Contact email                                                                                   |
| **Request**           | Medicine       | Name, strength, SKU, category                                                                   |
|                       | Quantity       | Requested quantity                                                                              |
|                       | Reason         | Full text from request form                                                                     |
|                       | Submitted      | Timestamp                                                                                       |
| **Status**            | Current status | Displayed as a badge                                                                            |
|                       | Status history | Timeline of status changes with timestamps                                                      |
| **Notes**             | Internal notes | Staff can add notes visible only to staff. Timestamped.                                         |
| **Dispensing Record** | Auto-populated | Created when status moves to Claimed. Shows date, staff member, batch used, quantity dispensed. |

**Action buttons (context-dependent):**

| Current Status | Available Actions                                   |
| -------------- | --------------------------------------------------- |
| Pending        | [Deny] [Approve → Approved]                         |
| Approved       | [Move to Pending] [Prepare → Ready to Claim] [Deny] |
| Ready to Claim | [Move to Approved] [Dispense → Claimed]             |
| Claimed        | [View Only] (no actions, record is complete)        |
| Denied         | [Re-open → Pending]                                 |

**Deny flow (from modal):**

- Click "Deny" → modal shows:
  - Reason dropdown: Out of Stock, Not Available, Duplicate Request, Other.
  - Optional note textarea.
  - "Confirm Deny" (destructive red) / "Cancel" buttons.
- On confirm: status changes to Denied, card removed from Kanban, audit log entry created, viewer notified via toast.

**Dispense flow (from modal):**

- Click "Dispense → Claimed" → modal shows:
  - Stock verification: "Paracetamol 500mg — 120 in stock. Dispensing 2."
  - Batch selection dropdown (if multiple batches available, show batch with nearest expiry first).
  - "Confirm Dispense" / "Cancel" buttons.
- On confirm: stock decremented, dispensing record created, status → Claimed, viewer notified.
- If stock is insufficient: show error "Insufficient stock. Only [N] available." Block dispense.

**Audit trail:** Every action (Approve, Deny, Prepare, Dispense, Re-open) creates an audit log entry with: timestamp, staff member, action taken, from-status → to-status.

---

### 3.4 Dispensing Log (`/staff/dispensing`, `/admin/dispensing`)

**Purpose:** Historical log of all dispensing actions.

**Layout:** Filterable, sortable table.

| Column       | Description                       |
| ------------ | --------------------------------- |
| Date         | Dispensing date/time              |
| Medicine     | Name + SKU                        |
| Batch #      | Batch used                        |
| Quantity     | Dispensed quantity                |
| Requestor    | Name + ID                         |
| Staff        | Who dispensed                     |
| Request Link | Link to original request (if any) |

**Filters:** Date range, medicine, staff member, requestor, branch.

**Export:** CSV/PDF download button.

---

### 3.5 Reports & Analytics (`/staff/reports`, `/admin/reports`)

**Purpose:** Data-driven insights into inventory and dispensing.

**Layout:** **Filters-first dashboard** — filter controls at top, all charts/tables below update together.

**Filter bar (persistent at top):**

- Date range picker (preset: Last 7 days, 30 days, 90 days, Year, Custom).
- Branch selector (if multi-branch).
- Medicine category filter.

**Dashboard widgets (responsive grid):**

| Widget                     | Type            | Description                            |
| -------------------------- | --------------- | -------------------------------------- |
| **Stock Movement**         | Line/bar chart  | Stock in vs stock out over time        |
| **Expiry Timeline**        | Timeline/gantt  | Items grouped by expiry month          |
| **Usage by Category**      | Pie/donut chart | Dispensing volume by medicine category |
| **Dispensed vs Requested** | Bar chart       | Request fulfillment rate               |
| **Top Dispensed Items**    | Ranked table    | Most frequently dispensed medicines    |
| **Low-Stock Trend**        | Line chart      | Number of low-stock items over time    |

**Export controls:** "Export as CSV" / "Export as PDF" buttons.

---

### 3.6 Viewer Portal

#### 3.6.1 Browse Medicine (`/viewer`)

**Purpose:** View available medicine and submit requests.

**Layout:** Search + filter list (no multi-panel for Viewer — simpler experience).

```
┌──────────────────────────────────────────┐
│  [🔍 Search medicine...]                 │
│  [Category ▼] [Status ▼]                │
├──────────────────────────────────────────┤
│  Paracetamol 500mg          ● In Stock  │
│  Category: Analgesic    Qty: 120        │
│                              [Request →]│
├──────────────────────────────────────────┤
│  Amoxicillin 250mg         ● Low Stock  │
│  Category: Antibiotic    Qty: 8         │
│                              [Request →]│
├──────────────────────────────────────────┤
│  Ibuprofen 400mg           ○ Out of Stock│
│  Category: Analgesic    Qty: 0          │
│                              [Notify Me] │
└──────────────────────────────────────────┘
```

**List item details:**

- Medicine name + strength.
- Category.
- Availability status (In Stock / Low Stock / Out of Stock).
- Current quantity (shown or hidden — decide if Viewer should see exact counts).
- "Request" button (enabled if in stock) or "Notify Me" (if out of stock).

**Search:** Real-time search by medicine name.

**Filters:** Category dropdown, Availability status toggle.

#### 3.6.2 Request Flow

**Trigger:** Clicking "Request" on a medicine item.

**Layout:** Multi-step form (modal or dedicated page).

**Steps:**

1. **Medicine Confirmation** — shows selected medicine details.
2. **Request Form:**
   - Full name (text input).
   - Student/Staff ID (text input).
   - Reason for request (textarea).
   - Quantity needed (number input, default 1).
3. **Review & Submit** — summary + "Submit Request" button.
4. **Confirmation** — success message with request ID + "Track Status" link.

**Validation:** All fields required. Quantity must be ≥ 1 and ≤ available stock.

#### 3.6.3 Request History (`/viewer/history`)

**Purpose:** View own request history and claim status.

**Layout:** Simple table or card list.

| Field    | Description                                            |
| -------- | ------------------------------------------------------ |
| Date     | Request submission date                                |
| Medicine | Name requested                                         |
| Quantity | Requested quantity                                     |
| Status   | Pending / Approved / Ready to Claim / Claimed / Denied |
| Actions  | View details / Track                                   |

**Status indicators:**

- Pending: yellow badge.
- Approved: blue badge.
- Ready to Claim: green pulsing badge (attention-grabbing).
- Claimed: gray badge (completed).
- Denied: red badge.

#### 3.6.4 Claim Status (`/viewer/claims`)

**Purpose:** View items ready to claim and claim history.

**Layout:** Two sections:

1. **Ready to Claim** — prominent cards for items waiting at the counter. Shows medicine name, location/branch, staff to ask for.
2. **Claimed History** — table of previously claimed items with dates.

---

### 3.7 Admin-Only Screens

#### 3.7.1 User Management (`/admin/users`)

**Purpose:** Create, edit, deactivate user accounts and assign roles.

**Layout:** Table + detail panel (multi-panel).

| Column     | Description                             |
| ---------- | --------------------------------------- |
| Name       | User's full name                        |
| Email      | Email address                           |
| Role       | Admin / Staff / Viewer (editable badge) |
| Branch     | Assigned branch                         |
| Status     | Active / Inactive                       |
| Last Login | Timestamp                               |

**Actions:** Create user, edit user, deactivate/activate, reset password, change role.

#### 3.7.2 System Settings (`/admin/settings`)

**Purpose:** Configure system-wide preferences.

**Layout:** Tabbed settings page.

| Tab                  | Content                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| **General**          | App name, default branch, date/time format                                                         |
| **Branches**         | Branch CRUD (name, location, status)                                                               |
| **Alert Thresholds** | Configurable low-stock threshold per item (or global default), expiry alert window (30/60/90 days) |
| **Suppliers**        | Supplier catalog CRUD (name, contact, lead time)                                                   |
| **Categories**       | Medicine category management                                                                       |
| **Backup**           | Manual backup trigger, backup location config                                                      |

#### 3.7.3 Audit Logs (`/admin/audit`)

**Purpose:** View complete system activity log.

**Layout:** Filterable, searchable table.

| Column    | Description                                                                      |
| --------- | -------------------------------------------------------------------------------- |
| Timestamp | Date/time of action                                                              |
| User      | Who performed the action                                                         |
| Action    | Stock In / Stock Out / Request / Dispense / User Create / Settings Change / etc. |
| Details   | Brief description of what changed                                                |
| Branch    | Which branch was affected                                                        |

**Filters:** Date range, user, action type, branch.

**Search:** Free-text search across details.

#### 3.7.4 Data Export/Import (`/admin/data`)

**Purpose:** Export system data or import from backup.

**Layout:** Simple page with two cards.

1. **Export:** Select data type (Inventory, Requests, Dispensing Logs, All) → format (CSV, JSON) → Download.
2. **Import:** Upload file → preview diff → confirm import. Supports backup restoration.

#### 3.7.5 System Health (`/admin/health`)

**Purpose:** Monitor application and database health.

**Layout:** Status cards grid.

| Card        | Content                                         |
| ----------- | ----------------------------------------------- |
| Database    | Connection status, size, last query time        |
| Storage     | Disk usage, free space                          |
| Sync        | Last sync timestamp, pending syncs, sync errors |
| Backup      | Last backup, next scheduled backup              |
| Performance | Query response times, cache hit rate            |

---

### 3.8 Barcode Scanner Integration

**Placement:** The barcode/QR scanner input is an **always-on input field** that appears in:

- Stock In form (Step 1).
- Stock Out form (Step 1).
- Inventory list panel (as a quick-search alternative).

**Behavior:**

- Auto-focused when the form/page loads.
- Accepts keyboard input from USB barcode/QR scanner (acts as keyboard wedge).
- On scan: instantly looks up item in database.
- If found: auto-fills form fields and advances to next step.
- If not found: shows "Item not found" message with option to create new item.
- Visual indicator: scan icon + "Scan barcode or type SKU" placeholder.

**Technical note:** The Tauri frontend receives scanner input as regular keyboard events. No special camera integration needed for USB scanners. Camera-based scanning would be a future enhancement.

---

## 4. Key User Flows

### 4.1 Staff Daily Workflow

```
1. App opens (auto-login)
   → Toast: "3 items expiring within 30 days, 2 items low stock"
   → Staff Home dashboard loads with stats + alerts

2. Staff reviews alerts
   → Clicks "Expiring Soon" stat card → navigates to Expiry Alerts
   → Disposes of expired items → stock updated

3. Staff processes incoming delivery
   → Clicks "Stock In" → scans barcode → fills batch/expiry/qty → submits
   → Inventory updated, toast confirmation

4. Staff reviews request queue
   → Clicks "Request Queue" → Kanban board
   → Approves pending request → card moves to "Approved"
   → Prepares item → moves to "Ready to Claim"
   → Viewer is notified

5. Viewer claims medicine
   → Staff sees "Ready to Claim" → dispenses item
   → Card moves to "Claimed" → stock out logged → dispensing record created
```

### 4.2 Viewer Request Flow

```
1. Viewer opens app
   → Lands on Browse Medicine screen
   → Sees search bar + list of available medicine

2. Viewer searches for medicine
   → Types "paracetamol" → filtered list shows matching items
   → Sees Paracetamol 500mg — In Stock (Qty: 120) — [Request →]

3. Viewer clicks Request
   → Request form opens
   → Fills: Name, Student ID, Reason ("Headache"), Quantity (1)
   → Submits → confirmation screen with request ID

4. Staff approves request
   → Viewer's request history shows "Approved"

5. Staff prepares item
   → Viewer sees "Ready to Claim" (green badge)

6. Viewer claims at counter
   → Staff dispenses → Viewer sees "Claimed" status
```

### 4.3 Admin Configuration Flow

```
1. Admin opens Settings
   → Navigates to Branches tab
   → Adds new branch "North Clinic" → saves

2. Admin manages users
   → Navigates to User Management
   → Creates new Staff account for North Clinic
   → Assigns role: Staff, Branch: North Clinic

3. Admin reviews audit logs
   → Navigates to Audit Logs
   → Filters by date range + user
   → Exports as CSV for records
```

---

## 5. Component Inventory

### 5.1 Existing Components (from `packages/ui`)

These components already exist and should be reused:

| Component                     | Usage                                        |
| ----------------------------- | -------------------------------------------- |
| `Button`                      | All action buttons                           |
| `Card`                        | Dashboard widgets, detail panels, list items |
| `Input`                       | Text fields in forms                         |
| `InputGroup`                  | Labeled form fields                          |
| `Textarea`                    | Multi-line inputs (reason, notes)            |
| `DropdownMenu`                | Context menus, filter dropdowns              |
| `Checkbox`                    | Multi-select filters                         |
| `Label`                       | Form field labels                            |
| `Skeleton`                    | Loading states                               |
| `Sonner` (Toast)              | Notifications, alerts                        |
| `Empty`                       | Empty states                                 |
| `Tooltip`                     | Icon tooltips                                |
| `Marker`                      | Status indicators/badges                     |
| `Attachment`                  | File attachments (data import)               |
| `Bubble`                      | Chat-like UI (if needed)                     |
| `Message` / `MessageScroller` | Notification-style messages                  |

### 5.2 Components to Build

| Component            | Purpose                                               | Priority |
| -------------------- | ----------------------------------------------------- | -------- |
| `Sidebar`            | Grouped vertical navigation                           | High     |
| `ResizablePanel`     | Draggable split panel container                       | High     |
| `KanbanBoard`        | Horizontal Kanban board container with columns        | High     |
| `KanbanColumn`       | Single column within the Kanban board                 | High     |
| `KanbanCard`         | Compact card within a Kanban column (draggable)       | High     |
| `KanbanFilterBar`    | Horizontal filter controls above Kanban columns       | High     |
| `KanbanBatchActions` | Bottom toolbar for batch operations on selected cards | High     |
| `RequestDetailModal` | Modal overlay for viewing/request details             | High     |
| `DataTable`          | Sortable, filterable table with columns               | High     |
| `StatsCard`          | Dashboard stat card with icon + value + trend         | High     |
| `FilterBar`          | Horizontal filter controls (date range, dropdowns)    | High     |
| `SearchInput`        | Search with real-time filtering                       | High     |
| `BarcodeInput`       | Always-on barcode scan input field                    | High     |
| `StepForm`           | Linear multi-step form wrapper                        | High     |
| `DatePicker`         | Date selection input                                  | Medium   |
| `BranchSelector`     | Global branch dropdown                                | Medium   |
| `RoleBadge`          | Visual role indicator badge                           | Medium   |
| `StatusBadge`        | Request/item status badge                             | Medium   |
| `ActivityFeed`       | Recent activity list                                  | Medium   |
| `AuditLogTable`      | Audit-specific table with expandable rows             | Medium   |
| `SettingsTabs`       | Tabbed settings page layout                           | Medium   |
| `ExportButton`       | CSV/PDF export trigger                                | Medium   |
| `ImportDropzone`     | Drag-and-drop file import area                        | Low      |
| `SystemHealthCard`   | Health metric display card                            | Low      |

---

## 6. Route Map

| Route                        | Screen                     | Role(s) |
| ---------------------------- | -------------------------- | ------- |
| `/admin`                     | Admin Home (System Health) | Admin   |
| `/admin/inventory`           | Inventory Management       | Admin   |
| `/admin/inventory/expiry`    | Expiry Alerts              | Admin   |
| `/admin/inventory/low-stock` | Low-Stock Alerts           | Admin   |
| `/admin/requests`            | Request Queue (Kanban)     | Admin   |
| `/admin/dispensing`          | Dispensing Log             | Admin   |
| `/admin/reports`             | Reports & Analytics        | Admin   |
| `/admin/users`               | User Management            | Admin   |
| `/admin/settings`            | System Settings            | Admin   |
| `/admin/audit`               | Audit Logs                 | Admin   |
| `/admin/data`                | Data Export/Import         | Admin   |
| `/admin/health`              | System Health              | Admin   |
| `/staff`                     | Staff Home (Dashboard)     | Staff   |
| `/staff/inventory`           | Inventory Management       | Staff   |
| `/staff/inventory/expiry`    | Expiry Alerts              | Staff   |
| `/staff/inventory/low-stock` | Low-Stock Alerts           | Staff   |
| `/staff/requests`            | Request Queue (Kanban)     | Staff   |
| `/staff/dispensing`          | Dispensing Log             | Staff   |
| `/staff/reports`             | Reports & Analytics        | Staff   |
| `/viewer`                    | Browse Medicine            | Viewer  |
| `/viewer/history`            | Request History            | Viewer  |
| `/viewer/claims`             | Claim Status               | Viewer  |

---

## 7. Resizable Panel Behavior

- **Default split:** 40% list / 60% detail.
- **Draggable divider:** User can resize between 25% / 75% and 75% / 25%.
- **Preference persistence:** Saved to `tauri-plugin-store` (key: `panel-ratio`).
- **Auto-adjust behavior:** When no item is selected, list panel takes 100% width and detail panel is hidden. When an item is selected, splits to saved ratio.
- **Collapse:** Double-click divider → collapses detail panel entirely (list takes full width).

---

## 8. Toast Notification System

| Event                     | Toast Type                        | Message                                                 |
| ------------------------- | --------------------------------- | ------------------------------------------------------- |
| App opens (Staff/Admin)   | Info (persistent until dismissed) | "X items expiring within 30 days" / "Y items low stock" |
| Stock In success          | Success                           | "Stock logged: [Item] +[Qty]"                           |
| Stock Out success         | Success                           | "Dispensed: [Item] -[Qty]"                              |
| Request received (Staff)  | Info                              | "New request from [Name]: [Medicine]"                   |
| Request approved (Viewer) | Success                           | "Your request for [Medicine] has been approved!"        |
| Ready to claim (Viewer)   | Success (persistent)              | "Your [Medicine] is ready to claim at [Branch]!"        |
| Request denied (Viewer)   | Error                             | "Your request for [Medicine] was denied. [Reason]"      |
| Sync complete             | Success                           | "Data synced successfully"                              |
| Sync conflict             | Warning                           | "Sync conflict detected. Review in Audit Logs."         |

---

## 9. Empty States

Each screen should have a meaningful empty state:

| Screen                       | Empty State                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| Inventory (no items)         | "No medicine in inventory yet. Add your first item to get started." + [Add Item] button                   |
| Expiry Alerts (none)         | "No items expiring soon. All clear!" with checkmark icon                                                  |
| Low-Stock Alerts (none)      | "All items are well-stocked." with checkmark icon                                                         |
| Request Queue (empty)        | "No pending requests. New requests from viewers will appear here."                                        |
| Dispensing Log (empty)       | "No dispensing records yet."                                                                              |
| Reports (no data)            | "Not enough data to generate reports. Start logging stock movements to see analytics."                    |
| Viewer Browse (no results)   | "No medicine matches your search. Try different keywords."                                                |
| Viewer History (no requests) | "You haven't made any requests yet. Browse available medicine to get started." + [Browse Medicine] button |

---

## 10. Accessibility Notes

- All interactive elements must be keyboard-navigable (Tab, Enter, Escape).
- Form inputs must have associated `<label>` elements.
- Status badges must include `aria-label` for screen readers.
- Kanban drag-and-drop must have keyboard alternatives (move buttons).
- Color is never the sole indicator of status — always pair with text/icons.
- Focus management: when opening modals/panels, focus moves to the first interactive element.
- Skip navigation link for sidebar.

---

## 11. Responsive Considerations

Although this is a desktop app (Tauri), the window is resizable (min 800×600). Consider:

- At narrow widths (< 900px): sidebar collapses to icon-only mode.
- Detail panel stacks below list panel when width is too narrow for side-by-side.
- Kanban columns scroll horizontally on narrow windows.
- Forms remain usable at minimum window size.

---

## 12. Data Display Conventions

- **Dates:** Display in `MMM DD, YYYY` format (e.g., "Jan 15, 2026"). Use relative time for recent events ("2 hours ago").
- **Quantities:** Show as integers. Highlight zero in red.
- **Status:** Use colored badges: green (good/active), orange (warning), red (critical/expired), gray (inactive/completed).
- **Monetary values:** Not applicable (inventory, not purchasing).
- **Empty values:** Show "—" (em dash) instead of "N/A" or blank.

---

## 13. Open Questions (for future refinement)

1. Should Viewer see exact stock quantities, or just In Stock / Low Stock / Out of Stock?
2. How should barcode camera scanning (non-USB) be implemented — Tauri camera plugin?
3. Should the offline mode UI show a visible "offline" indicator in the header?
4. Should the dispensing log allow inline editing of past records (Admin only)?
5. What data should appear on the Viewer's "Notify Me" flow for out-of-stock items?
