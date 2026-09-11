# CMIS — System Flow

Clinical Inventory Management System (CMIS)

---

## 1. High-Level Flow (Viewer Request → Dispensing)

```
Viewer                     Staff                        System
  |                          |                             |
  |--- Views available ------------------------------------>|
  |<-- Stock list (available/unavailable) -------------------|
  |                          |                             |
  |--- Selects medicine ------------------------------------>|
  |<-- Request form ------------------------------------------|
  |--- Fills & submits form --------------------------------->|
  |                          |<--- Request notification ------|
  |                          |--- Reviews request ------------>|
  |                          |--- Approves & prepares item --->|
  |<-- Claim notice -----------------------------------------|
  |--- Claims medicine at counter -----> (Staff hands item) |
  |                          |--- Logs dispensing (stock out)->|
  |                          |--- Links to requestor record -->|
  |                          |                             |
```

## 2. Stock Lifecycle Flow (Staff-driven)

```
Supplier Delivery
      |
      v
Staff logs "Stock In" (batch/lot #, expiry date, quantity, supplier)
      |
      v
Item enters inventory --------> [System monitors]
      |                                |
      |                          - Expiry tracking
      |                          - Low-stock threshold
      |                                |
      v                                v
Available for request/dispense    Alerts triggered
      |                          (expiry soon / low stock)
      v                                |
Dispensed via:                         v
 - Direct staff stock-out         Staff reorders / disposes
 - Viewer-requested claim         expired stock
      |
      v
Stock updated + Dispensing log created (linked to requestor)
      |
      v
Reflected in Reports & Analytics dashboard
```

## 3. Role-Based Access Flow

```
Login
  |
  v
Role Check
  |-- Admin  --> Full dashboard (users, all branches, settings, reports, override tools)
  |-- Staff  --> Operational dashboard (inventory, requests queue, alerts, reports for assigned branch)
  |-- Viewer --> Self-service portal (browse stock, submit request, view own claim status)
```

## 4. Offline / Sync Flow (Staff)

```
Unstable/No internet
      |
      v
Staff continues logging locally (stock in/out, dispensing)
      |
      v
Connection restored
      |
      v
System auto-syncs local logs to central database
      |
      v
Conflicts (if any) flagged for Admin/Staff review
```

---

## 5. Open Questions for Further Scoping
- Does "claim right away" mean auto-approval, or does Staff need to manually approve every request before the Viewer can claim?
- Should multi-branch stock be fully separate per branch, or shared/transferable between branches?
- What identity source is used for Viewers (student ID system integration, manual account creation, etc.)?
- What's the low-stock threshold — fixed per item, or configurable by Staff/Admin?
