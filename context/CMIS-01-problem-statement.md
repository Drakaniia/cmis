# CMIS — Problem Statement

Clinical Inventory Management System (CMIS)

---

Bukidnon State University clinics manage medicine stock manually or through disconnected tools (spreadsheets, paper logs, verbal requests). This creates several recurring problems:

- No real-time visibility into stock levels, leading to shortages or overstocking.
- Expired medicine going undetected until it's discovered during physical checks.
- No audit trail of who dispensed what, to whom, and when.
- Reordering happens reactively instead of proactively.
- Students/staff requesting medicine have no structured way to do so, and clinic staff have no structured way to log the request.

**CMIS** is a clinical medicine inventory system that digitizes stock management, dispensing, and requesting for a university clinic, with role-based access so that administrative control, day-to-day stock operations, and end-user requests are properly separated.

---

## Roles at a Glance

| Role | Purpose |
|---|---|
| Admin | Manages the overall state of the system; full access; troubleshoots issues |
| Staff | Handles day-to-day inventory: stock in/out, expiry/low-stock alerts, dispensing, procurement |
| Viewer | Views available medicine, submits a request, claims medicine once approved |

See `CMIS-02-user-stories.md` for detailed role permissions and user stories, and `CMIS-03-system-flow.md` for the process flow.
