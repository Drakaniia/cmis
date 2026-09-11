# University Clinic Inventory Management System — Pre-Implementation Gap & Feature Spec

**Date:** 2026-09-10
**Status:** Draft — Discovery Phase (Tech Stack Intentionally Withheld)
**Source:** Interview with Doctor-in-Charge, University Clinic; README.md 2026-09-10 13:34
**Author:** OpenCode / Muse Spark — gap analysis before build

---

## 1. Purpose

This spec captures **what is missing** and **what should be built next** before any implementation begins. It avoids tech-stack decisions and focuses on operational gaps, user needs, and feature opportunities that justify the system.

---

## 2. Current State (As-Is)

### 2.1 Systems Already Present

1.  **Database / Records System** — stores documents and patient/clinic records (interview-confirmed, exists).
2.  **Appointment / Scheduling System** — manages patient appointments (interview-confirmed, exists).

Both are referenced by the doctor-in-charge as "already present" and operational.

### 2.2 System Absent / Requested

- **Medicine & Clinic Supply Inventory** — identified by the doctor-in-charge as the single largest automation gap. No dedicated inventory system today.

### 2.3 Current Workarounds (Inferred + Confirmed Pain Points)

Confirmed by follow-up interview (user answered "all of these"):

- Stockouts and expired medicines discovered too late.
- Manual counting on paper / spreadsheets.
- No audit trail for who dispensed what to whom.

---

## 3. Problem Statement

The clinic can schedule patients and store records, but cannot reliably answer:

> "Do we have it, how much, where, which batch expires when, who gave it to whom, and when should we reorder?"

Consequences: expired medicines dispensed or wasted, stockouts during care, time lost to manual counts, weak accountability, and difficult university audits.

---

## 4. Goals (To-Be)

1.  **Zero expired dispensing & zero avoidable stockouts** — system blocks expired batches and warns before stockout.
2.  **Paperless, auditable inventory** — every stock movement is logged with actor, timestamp, and reason.
3.  **Waste reduction** — expiry visibility + FEFO reduces disposal volume.
4.  **Time saved** — counting, monthly reports, and audits finish in minutes, not hours.
5.  **Procurement-ready** — full inbound traceability (supplier / PO / batch) to justify purchases.

Primary success criteria (user-selected, all four):

- Never dispense expired / never miss stock.
- Cut expired disposal waste.
- Faster counting and audits.
- Fully digital, exportable audit trail.

---

## 5. Scope

### 5.1 In Scope (Phase 1 Target)

User selected **"All clinic assets"** — not medicines alone.

- **Medicines** — tablets, capsules, syrups, injectables, topical, controlled substances.
- **Consumables / Supplies** — cotton, gauze, syringes, gloves, alcohol, bandages, first-aid kits.
- **Lab reagents & other clinic items** — where applicable.
- **Equipment tracking (light)** — optional flag for durable items; not full asset depreciation, but quantity + condition + location if clinic wants it. Note: if true equipment lifecycle is needed, split to Phase 2.

### 5.2 Out of Scope (Explicitly Defer)

- Rebuilding the existing Records or Scheduling systems.
- University-wide procurement / finance ERP replacement.
- Multi-campus inventory (single clinic only for Phase 1).

### 5.3 Integration Posture

User selected **"Full integration later"**: build as **standalone** but **integration-ready**.

- Design dispensing so it can later auto-deduct when a consultation/prescription is recorded in the Records system.
- Patient lookup should accept patient ID/name that matches the Records system (no duplication if possible).
- Appointment ID linkage optional today, mandatory-ready later.

---

## 6. Stakeholders & Roles

Confirmed: **Doctor + Clinic Staff** (nurses, clinic aides, admin). Procurement is downstream consumer, not daily user.

| Role                             | Access                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Doctor-in-Charge**             | Full admin: approves restricted dispensing, disposal/adjustments, sees all reports, manages thresholds. |
| **Clinic Staff (Nurse/Aide)**    | Stock-in, dispense, view dashboards/alerts, initiate disposal/return/adjustment requests.               |
| **Viewer / Auditor (Read-only)** | University audit / admin viewing reports and exports (to be confirmed).                                 |
| **Procurement Liaison (Future)** | Receives reorder suggestions / POs; not a Phase 1 actor unless requested.                               |

**Gap closed:** role-based access with audit attribution — every action ties to a logged-in user.

---

## 7. Gap Analysis — From Pain Point to Feature

| #   | Gap (Pain Point)                             | Root Cause Without System                   | Feature That Closes It                                                                                                           |
| --- | -------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Stockouts discovered during consultation     | No reorder point, no consumption visibility | **Per-item reorder point + low-stock dashboard + push/in-app alerts**                                                            |
| G2  | Expired medicines found on shelf / dispensed | No batch/expiry tracking, no FEFO           | **Batch/lot + expiry per receipt; FEFO suggestion; block-expired dispensing; expiry alerts (e.g., 90/60/30/7-day buckets)**      |
| G3  | Manual counting burden                       | Paper/Excel, no stock card                  | **Real-time stock ledger + stock card per item + cycle-count / physical-count adjustment workflow**                              |
| G4  | No audit trail (who gave what to whom)       | No logged actor/timestamp/patient linkage   | **Immutable movement log (receive/dispense/return/dispose/adjust/transfer) with actor + patient linkage under privacy controls** |
| G5  | Cannot justify procurement                   | No consumption / supplier history           | **Consumption analytics + supplier/PO history + auto reorder suggestion list**                                                   |
| G6  | Waste & disposal not documented              | No disposal workflow with witness           | **Expiry/damage disposal with reason, witness/approver, and printable disposal report**                                          |
| G7  | Reports take hours                           | No exports or dashboards                    | **One-click monthly consumption, inventory valuation, expiry & disposal reports (PDF/Excel export for audit)**                   |
| G8  | Restricted medicines risk                    | No approval gate                            | **Restricted-item flag → dispensing requires doctor approval**                                                                   |
| G9  | Inefficient dispensing                       | No FEFO or stock check                      | **Availability + expiry validation at dispense; suggest earliest-expiring batch**                                                |
| G10 | Mobile/bedside use missing                   | Desktop/paper only                          | **Mobile-friendly access for nurses (responsive; future: scanner support)**                                                      |

---

## 8. Functional Requirements

### 8.1 Master Data (Catalog)

- **Item master** — name, generic name, category (medicine/consumable/equipment/reagent), unit (pcs, box, bottle, vial), SKU/code, barcode/QR (optional), restricted flag, storage condition (room-temp / cold-chain), reorder point, expiry-alert lead days, active/inactive.
- **Supplier master** — name, contact, address.
- **Single storage location** — clinic stockroom (user confirmed single storage; no bin/transfer complexity for Phase 1, but schema should allow location extension later).

### 8.2 Inbound (Stock-In / Receiving)

- Record **receipt** against supplier + PO/delivery receipt no. + date + received-by.
- Per batch: **lot/batch no., expiry date, quantity, unit cost** (for valuation), remarks.
- Support multiple batches per receipt (same item, different expiries).
- Attachment: scanned delivery receipt (image/PDF).
- Auto-creates ledger entries; updates on-hand balance.

### 8.3 Dispensing (Stock-Out to Patient)

- Deduct from **specific batch** (system suggests FEFO batch).
- Fields: patient ID/name (linked to Records if available), appointment/consultation reference (optional Phase 1), prescriber, dispenser, quantity, batch, reason/notes.
- **Validations:** block if insufficient stock (no negative stock), block/warn if batch expired, block if restricted item without approval.
- **Restricted flow:** request → doctor approval → dispense; approval logged.

### 8.4 Returns, Disposal, Adjustments (Exception Flows — All Required)

- **Return:** patient returns unused quantity → restock to batch if usable + reason.
- **Disposal (expired/damaged):** create disposal record with quantity, batch, reason, evidence note, **witness + approver (doctor)**; quantity removed from on-hand; batch status marked disposed.
- **Stock Adjustment (Physical Count):** count sheet vs. system; adjustment entry with **reason code** (count correction, breakage, etc.) + approver; every adjustment is audit-logged, never silent overwrite.
- **Negative stock prevention:** system never allows on-hand < 0.

### 8.5 Alerts & Notifications

- **Low stock:** when on-hand ≤ reorder point → dashboard warning + notification.
- **Expiry alerts:** configurable per item (e.g., 30/60/90 days); global defaults + per-item override. Buckets: expired, expiring in 7/30/90 days.
- **Delivery:** dashboard banners/badges + in-app notification inbox; email/push as optional if clinic provides emails (queue-ready even if not enabled Day 1).
- Thresholds editable by Doctor-in-Charge only.

### 8.6 FEFO Logic

- On dispense, system **sorts batches by expiry ascending** (then by receipt date) and suggests the earliest expiring batch with sufficient quantity.
- User may override with reason (logged).

### 8.7 Audit Trail & Privacy

- **Immutable log** for every movement: timestamp, actor, action type, item, batch, quantity, before/after balance, patient linkage (if any), reason.
- **Privacy-controlled patient linkage:** only authorized clinic roles see patient-linked dispensing history; audit/export respects role filters.
- No hard delete of ledger entries; corrections via reversing adjustment.

### 8.8 Reporting & Exports (All Required)

- **Stock Card / Ledger per Item** — chronological movements + running balance.
- **Inventory Summary (On-Hand)** — qty by item & batch, expiry, status (in-stock / low / out / expired).
- **Consumption Report** — by period, by item/category, by dispenser.
- **Expiry & Disposal Report** — expired qty, disposed qty, waste cost.
- **Inventory Valuation** — qty × unit cost per batch.
- **Audit Trail Report** — filterable by actor/action/date/patient.
- **Reorder Suggestion Report** — items at/below reorder point with suggested order qty (based on avg consumption × lead time).
- Exports: **PDF & Excel/CSV** for university/COA audits; date-range filters.

### 8.9 Dashboards & Analytics (Advanced Features — All Requested)

- **KPI tiles:** low-stock count, expired count, expiring soon, total valuation, disposal this month.
- **Charts:** most-consumed items (top 10), consumption trend (monthly), expiry trend, waste vs. dispensed ratio, stockout incidents.
- **Forecasting:** simple consumption-based forecast — e.g., avg daily consumption (30/90-day window) → projected stockout date per item; highlight risk items.
- **Reorder intelligence:** suggested purchase list ranked by urgency (days until stockout).

### 8.10 Access & Administration

- Role-based access (doctor / staff / auditor).
- User management (activate/deactivate).
- Item threshold management.
- Supplier management.
- Reason codes (disposal, adjustment) management.
- Mobile-responsive layout (user prioritized **Mobile access**).

---

## 9. Non-Functional Requirements

- **Ease of use (highest priority):** non-technical staff productive after ≤ 1-day training; Tagalog labels/help text considered as follow-up (user flagged bilingual as future, English primary for Phase 1).
- **Scale assumption (to validate):** ~ <200 SKUs listed by clinic; design comfortably for 1,000 SKUs, 3–5 concurrent users (small scale per interview).
- **Data integrity:** no negative stock; expiry dates immutable after receipt unless via approved adjustment.
- **Availability:** single-clinic deployment; mobile access required; offline mode and barcode/QR scanning marked **Phase 2 nice-to-have** (not Phase 1 blocker per current answers).
- **Security:** authenticated access, role checks on every mutating action, audit log tamper-evident.
- **Retention:** retention policy for logs/exports (to confirm with university; default: retain ≥ 3 years or per university policy).
- **Usability:** confirmation dialogs for destructive actions (dispose/adjust), undo via reversal not deletion.

---

## 10. Data Model Sketch (Implementation-Agnostic)

- **Item** (1) —< **Batch** (n) —< **Movement** (n)
- **Supplier** (1) —< **Receipt** (n) —< **ReceiptLine/Batch** (n)
- **Movement** types: RECEIVE, DISPENSE, RETURN, DISPOSE, ADJUST_IN, ADJUST_OUT
- **PatientDispensing** links Movement → Patient (ID only, details mastered in Records system)
- **Approval** for restricted dispense & disposal/adjustment
- **User** + **Role**

This intentionally omits DB/stack choices.

---

## 11. Open Questions & Assumptions to Validate

Assumptions made where interview data was thin:

1.  **PO workflow:** Is PO created inside this system or only referenced (PO number from university finance)? Spec assumes reference-only for Phase 1, creation later.
2.  **Cold-chain:** Any fridge items? Spec includes storage-condition flag but single location; confirm if fridge needs separate alert logic.
3.  **Valuation method:** Weighted average vs. batch cost? Spec uses batch cost for simplicity; confirm with finance.
4.  **Patient linkage depth:** Show patient name vs. ID-only to preserve privacy? Proposed: name visible to clinic roles only, ID-only in exports unless authorized.
5.  **Notifications channel:** Which emails/phones should receive alerts? Gather during requirements workshop.
6.  **Barcode/QR:** Defer to Phase 2 unless clinic already prints barcodes; placeholder field added.
7.  **Language:** English primary; Tagalog toggle Phase 2 if needed.
8.  **Audit format:** Confirm university/COA export template before finalizing PDF layout.

---

## 12. Phasing Recommendation

**Phase 1 (MVP — Must-Have to Close Core Gaps)**

- Catalog, receiving with batch/expiry, FEFO dispensing with validations, restricted approval, low-stock + expiry alerts (dashboard + inbox), audit trail, stock card / summary / expiry reports, disposal & adjustment workflows, role-based access, mobile-responsive.

**Phase 2 (Value-Add — All Advanced Features Requested)**

- Auto reorder suggestions, forecasting (stockout projection), consumption analytics dashboard, barcode/QR scanning, offline-tolerant mode, bilingual UI, deeper Records/Scheduling integration (auto-deduct on prescription).

**Phase 3 (Expansion)**

- Multi-location (if clinic expands storage), full equipment-asset lifecycle, procurement PO creation inside system, university finance integration.

---

## 13. Risks & Mitigations

| Risk                                             | Mitigation                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Data entry burden → staff revert to paper        | FEFO defaults, barcode-ready fields, mobile access, minimal required fields + training |
| Expiry still missed if batches not entered       | Make batch+expiry mandatory on receipt; block receipt without expiry for medicines     |
| Restricted meds dispensed without approval       | Enforce approval gate in workflow, not just UI                                         |
| Single storage assumption breaks if fridge added | Model location as attribute (single today, extensible)                                 |
| Privacy leak on patient-linked logs              | Role-scoped views + export redaction                                                   |

---

## 14. Next Steps (Before Build)

1.  **Workshop (½ day) with clinic staff** — walk through §8 flows with real forms/POs; capture SKU list and reorder points.
2.  **Confirm report templates** — get sample university audit export format.
3.  **Finalize supplier/PO process** — reference vs. create decision.
4.  **Approve Phase 1 scope** — lock MVP vs. Phase 2 list above.
5.  **Then** choose stack and produce technical design (out of scope here).

---

## Appendix A — Interview Traceability

- README.md: gaps = records ✓, scheduling ✓, inventory ✗.
- Q1: pain points = stockouts + expiry + manual counting + no audit trail → G1–G4, G9.
- Q2: integration = Full integration later → §5.3.
- Q3: scope = All clinic assets → §5.1.
- Q4: users = Doctor + clinic staff → §6.
- Stock-in = Track full procurement → §8.2.
- Dispensing = Restricted meds need approval → §8.3 + §8.4 approval.
- Alerts = All of the above → §8.5.
- Reports = All reporting needed → §8.8.
- Storage = Single storage → §8.1, §9.
- Edge cases = All exception flows → §8.4.
- Offline/scale = Mobile access prioritized → §8.10, §9.
- Compliance = All (privacy + FEFO + export) → §8.6–§8.8.
- Advanced = All (forecast + reorder + analytics) → §8.9.
- Ease of use = priority → §9; success = all four → §4.

---

**End of Spec — ready for stakeholder review before technical design.**
