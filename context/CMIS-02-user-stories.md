# CMIS — User Roles & User Stories

Clinical Inventory Management System (CMIS)

---

## 1. User Roles

### Admin
Full system control and oversight.
- Full access to all modules (stock, users, reports, settings).
- Manage user accounts and role assignments (admin / staff / viewer).
- Troubleshoot and resolve system issues (data corrections, error logs, overrides).
- Configure system-wide settings (branches, alert thresholds, suppliers).
- View all reports and analytics across the system.

### Staff
Operates the clinic's day-to-day inventory.
- **Stock in / stock out logging** — record incoming deliveries and outgoing usage.
- **Expiry date tracking with alerts** — flagged automatically as items approach expiry.
- **Low-stock / reorder alerts** — notified when items fall below threshold.
- **Barcode / QR code scanning** — quick lookup and logging of items.
- **Batch / lot number tracking** — trace specific batches through the system.
- **Supplier / procurement management** — manage supplier records and purchase orders.
- **Dispensing log tied to patient/requestor records** — every dispensed item is linked to who received it.
- **Reports & analytics dashboard** — view stock movement, usage trends, expiry reports.
- **Multi-branch / multi-location support** — manage stock across clinic branches (if applicable).
- **Mobile-friendly access** — usable on tablets/phones at the dispensing counter.
- **Offline mode** — continue logging during unstable internet, sync once reconnected.
- Approves/fulfills medicine requests submitted by viewers.

*(Note: Staff does not manage user accounts or system-wide configuration — that's Admin-only.)*

### Viewer (Student / Requestor)
Limited, self-service access.
- View available medicine and current stock status (in-stock / out-of-stock).
- Submit a **request** for a medicine — triggers a request form.
- Fill out the request form (e.g., name, ID, reason, medicine needed, quantity).
- Once the form is submitted and approved/filled, claim the medicine at the clinic counter.
- View their own request/claim history (not other users' data).

---

## 2. Role Permission Matrix

| Capability | Admin | Staff | Viewer |
|---|:---:|:---:|:---:|
| Manage user accounts & roles | Yes | No | No |
| System troubleshooting / overrides | Yes | No | No |
| Stock in / stock out | Yes | Yes | No |
| Expiry & low-stock alerts | Yes | Yes | No |
| Barcode/QR scanning | Yes | Yes | No |
| Batch/lot tracking | Yes | Yes | No |
| Supplier/procurement management | Yes | Yes | No |
| Dispensing log | Yes | Yes | No (own record only) |
| Reports & analytics | Yes | Yes | No |
| Multi-branch management | Yes | Yes (assigned branch) | No |
| View available medicine | Yes | Yes | Yes |
| Submit medicine request | Yes | Yes | Yes |
| Claim requested medicine | Yes | Yes | Yes |

---

## 3. User Stories

**Admin**
- As an Admin, I want to create and manage staff/viewer accounts so that access is properly controlled.
- As an Admin, I want to see system logs so I can troubleshoot issues quickly.
- As an Admin, I want to view all branches' data so I can oversee clinic operations university-wide.

**Staff**
- As Staff, I want to log stock in/out so inventory counts stay accurate.
- As Staff, I want to be alerted before medicine expires so I can use or dispose of it in time.
- As Staff, I want to be alerted when stock is low so I can reorder before running out.
- As Staff, I want to scan a barcode/QR code so I can log items quickly without manual entry.
- As Staff, I want to review and fulfill viewer requests so students can claim medicine efficiently.
- As Staff, I want offline logging so clinic operations aren't disrupted by poor connectivity.

**Viewer**
- As a Viewer, I want to see what medicine is currently available so I know what I can request.
- As a Viewer, I want to fill out a simple request form so I can formally ask for a medicine.
- As a Viewer, I want to claim my requested medicine right after submitting the form (if approved/available) so I don't have to wait unnecessarily.
