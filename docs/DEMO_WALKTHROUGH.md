# Demo walkthrough — EJO 100 beside SAP

A script for showing, live, how EJO 100 answers the questions Kewalram
Chanrai Group raised on 20 October 2026. Every step uses the real system and
invented demo data (no real customer is in these files). It grows with each
release; each section says which release it needs.

**Demo files** are in [`docs/demo/`](demo/). Regenerate them (same content
every time) with `npx tsx apps/portal/scripts/demo-files.ts`.

**People you need** (create them under Users if they do not exist): one
person who prepares imports (Group IT administrator or Administrator) and a
**different** person who approves them (Workshop manager, Customer care lead
or another Administrator). Use two browsers, or a normal and a private
window, so both can be signed in at once.

---

## 1. Existing customers from SAP, without retyping (A1)

*The question: "How do years of customers come in?"*

1. **Preparer** → menu **Data Exchange** → *Customers* → **Import customers**.
   Choose *SAP (an export or extract)* and drop
   `docs/demo/01_SAP_customers_demo.csv` (33 rows, SAP field names:
   KUNNR, NAME1, TELF1, SMTP_ADDR, STRAS, ORT01, ERDAT…).
2. **Match the columns**: point out that every SAP column matched itself.
   Choose *Leave it as it is* for existing customers, then *Save and check
   the file*.
3. **What the check found** — nothing has changed in the system yet:
   - **Rejected (1):** a row with no name.
   - **Duplicate in the file (1):** customer number 0001000105 appears twice; only
     the first loads.
   - **Ready, with a note:** the broken email (`yetunde.afolabi@@example`)
     loads **without** an email and says so, rather than stopping the row.
   - About a quarter of the customers have **no email at all**, as in real
     SAP data: they load as full customers, reached by phone, with **no
     made-up addresses**.
   - Download **Rejected rows (to fix in Excel)** and open it: the file's own
     columns plus a *Problem* column.
4. **Send for approval.** Show that the preparer has no Approve button: *the
   person who prepared an import cannot approve it.*
5. **Approver** → the bell shows *Approve import IMP-…* → **Approve** →
   **Start loading**. The progress bar shows rows a second and time left.
6. **Report:** *33 rows in the file = 31 added + 0 filled in + 0 not added +
   2 rejected.* Download *Every row and its outcome* — the reconciliation
   file. Open **Customers (CRM)** and search for one of them.
7. **Upload the same file again** (as the preparer): the page says it was
   imported before, and after the check every row shows as *Already a
   customer* — nothing is ever added twice. Cancel it.

## 2. Their vehicles, from Excel (A1)

1. **Preparer** → Data Exchange → *Vehicles* → drop
   `docs/demo/02_vehicles_demo.xlsx` (Isuzu NQR, NPR, QLR, QMR and Soueast S07).
2. The check links each vehicle to its customer by the SAP customer number,
   works out *Commercial* (NQR/NPR/QLR/QMR) or *Passenger* (S07) from the
   model, and catches the planted mistakes: **the same VIN twice**, **a
   vehicle with no VIN and no plate**, and **an unknown customer**
   (0009999999).
3. Approve as the approver, load, and open a customer to see their vehicle.

## 3. Undo is recoverable (A1 + Undo to the Recycle bin)

1. **Approver** → open the vehicles import → **Undo this import**. The
   vehicles it added move to the **Recycle bin** (reason: *Undo of import
   IMP-…*).
2. Undo the customers import the same way.
3. **Administrator** → **Recycle bin**: every undone customer and vehicle is
   there as its own item, with days left before it is emptied. **Restore**
   one: it comes back with its SAP customer number.
4. Undo is **refused** for any customer or vehicle that has had real work
   recorded since (a Job Card, a service, a warranty, a portal sign-in) — the
   page lists exactly which ones and why.

---

*Coming in the next releases (each adds a section here):* parts master and
opening stock (A2), customer-since dates and SAP invoice history in the
analytics, production / QC / PDI registers, export from every list (A4), the
daily SAP files and reconciliation (C1), PDI with certificates (D), and
inviting imported customers to the portal (B).
