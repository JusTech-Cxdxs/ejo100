# Demo walkthrough — EJO 100 beside SAP

A script for showing, live, how EJO 100 answers the questions Kewalram
Chanrai Group raised on 20 October 2026. Every step uses the real system and
invented demo data (no real customer is in these files). It grows with each
release; each section says which release it needs.

**Demo files** are in [`docs/demo/`](demo/). Regenerate them (same content
every time) with `npx tsx apps/portal/scripts/demo-files.ts`. They tell one
consistent story — each vehicle built, QC'd and through PDI before its first
service, services in mileage order, the model year the year it was built,
every customer a different person — so the vehicle page and the customer
360 never show an impossible history; only the planted mistakes break it
(a test checks this).

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

## 4. Suppliers, the parts catalogue and opening stock (A2)

*The questions: "800,000 parts — and the stock we hold today?"*

People: the **preparer** (Group IT), a **Store Manager** of the branch, and
someone in **Finance**.

1. **Suppliers.** Preparer → Data Exchange → *Suppliers* → drop
   `docs/demo/05_SAP_suppliers_demo.csv` (SAP vendor layout: LIFNR, NAME1…).
   Send for approval; the **Store Manager** approves and loads. Open
   **Store → Suppliers**: the list, with SAP vendor numbers.
2. **Parts.** Preparer → *Parts* → choose the branch → drop
   `docs/demo/03_SAP_parts_50k.csv` — **50,000 SAP materials** (MATNR, MAKTX,
   MATKL, MEINS, XCHPF…). Point out:
   - SAP's unit codes become words (ST → Piece, L → Litre, CAR → Carton);
   - lubricants come in as **batch-tracked**, with *1 Drum = 208 Litre*;
   - Group IT cannot approve: only the Store Manager (or an administrator).
   Approve and load as the Store Manager and watch rows a second.
   (For a quick first try, `03a_SAP_parts_200.csv` holds 200.)
3. **Store → Parts Catalog**: *Showing 1–50 of 50,000 parts*, paged; search
   "NQR brake" — instant. **Record Goods Receipt**: the part picker searches
   as you type and suggests the imported suppliers.
4. **Opening stock.** Preparer → *Opening stock* → same branch → **Counted
   on** = the cut-over date → drop `docs/demo/04_SAP_opening_stock_demo.csv`
   (MATNR, LABST, MEINS, SALK3, VERPR, CHARG, LGORT). The check:
   - shows **the lines, units and total value** that will load — "compare with
     the SAP stock report for the same plant and date";
   - rejects the planted mistakes: **negative stock** (`3-`), a **part not in
     the catalogue**, a line with **no cost**, a **batch part without its
     batch**.
5. Store Manager approves and loads. The report: *Stock value now in Isolo
   Branch: ₦… — Matches the checked file exactly.* Open one of the
   **opening-balance receipts** (GRN-…, supplier *Opening balance — SAP*,
   dated at the cut-over).
6. **Finance** → bell → *Confirm opening stock IMP-…* → **Confirm the value
   (Finance)**. The Store Manager could not: they approved it.
7. **Store → Inventory Analytics**: the stock value, FIFO costs and ageing
   now include the opening stock.
8. To show it is reversible: Store Manager → **Reverse this opening stock**
   → stock on hand goes back down and the receipts are removed (refused once
   anything has been issued); **Reopen** brings the file back to be checked
   and approved again.

## 5. SAP history feeds EJO's own figures (A3)

*The question: "Our customers have years with us — will EJO show them as
new?"*

People: the **preparer** (Group IT), the **Workshop manager** of a branch,
someone in **Finance**. Sections 1 and 2 loaded first.

1. **Customer since.** Open any customer from section 1 in **Customers
   (CRM)**: *Customer since 13/04/2015 (from SAP, customer 1000103) · in EJO
   100 since today* — SAP's ERDAT column in `01_SAP_customers_demo.csv`. The
   CRM's *New this month* does **not** count them: they are new to the
   system, not to the business. (Customers loaded before this release:
   re-run section 1's file with *fill in only empty fields* to add the date.)
2. **Invoice history.** Preparer → Data Exchange → *Invoice history* →
   choose the branch → drop `docs/demo/06_SAP_invoice_history_demo.csv`
   (SAP billing layout: VBELN, FKDAT, KUNAG, NETWR, MWSBK, WAERK, VHVIN,
   FKART). Point out:
   - net + tax (NETWR + MWSBK) is kept as the gross amount; credit notes
     (`25000.00-`, type G2) come in negative;
   - the check shows **the totals to reconcile with SAP**: invoices, amount,
     first and last date;
   - the planted mistakes: an **unknown customer**, a **dollar invoice**, **no
     invoice number**, **31 June**, and **the same invoice exported twice**.
3. **Workshop manager** approves and loads; **Finance** → bell → *Confirm
   invoice history IMP-…* → **Confirm the totals (Finance)**.
4. Open a customer: *Lifetime spend* now says **"Incl. ₦… from SAP, before
   EJO"**, *Visits* and *Last visit* include the SAP years, the 12-month chart
   shows recent SAP invoices, and **Jobs → From SAP, before EJO** lists every
   invoice, read-only. The CRM list's spend, *spend this year* and top
   spenders include them.
5. **Headquarters** (choose *This year*): each branch's
   *Collected* shows **"+ ₦… in SAP"** for the period, with a line under the
   figures; **Analytics** → *Top customers* marks the SAP share. EJO's own
   sales, margins and projections are unchanged — the history is reported
   beside them, not mixed in.
6. **Registers.** Preparer → *Production, QC and PDI registers* → **Which
   register is this file? → PDI register** → drop
   `docs/demo/07_PDI_register_demo.xlsx` (one row with no VIN is rejected).
   Then the same for `08_production_QC_register_demo.csv` (it has a
   *Register* column, so leave the choice empty). Workshop manager approves
   both.
7. Open a vehicle from section 2 (Workshop → Vehicles): **Before EJO 100**
   shows its production stations, QC gates (one *Rework* with the reason) and
   PDI steps (OK, or NG with the rectification) with dates and inspectors, and
   its SAP invoices. Inspectors' names are for staff only — the customer
   portal never shows this history.
8. To show it is recoverable: Workshop manager → the invoice import → **Undo
   this import** → the customer's spend drops back; nothing was deleted.
   **Reopen** and load again → the same invoices return, never twice.

## 6. Staged files are released, not kept for ever

1. **Data Exchange**: *Space used by staged files* shows how much the copies
   of imported files take now (the 50,000-part file of section 4 is the big
   one), and each import's own size in the list.
2. As an **administrator**, set *Release a finished import’s file after* to,
   say, 45 days, and save (0 keeps files for ever).
3. Open a finished import (the customers of section 1): *Staged file* says
   when it will be released automatically. As the **Workshop manager**, press
   **Release it now**: the space drops, but *Every row and its outcome* and
   *Rejected rows (to fix in Excel)* still download, and **Undo** still
   works. The import can no longer be reopened from the released file.

## 7. Find anything by its SAP number, and see where it came from

1. In the search box at the top, type an SAP customer number from section 1,
   with SAP's zeros: **0001000103**. The result reads *SAP customer 1000103*
   with the customer's name.
2. Type **0090005000**: two invoices, *SAP invoice 90005000 · 2025* and
   *· 2026* — SAP reused the number in a new fiscal year (company code 1000),
   and both are kept. Type **90005000 2026**: only that year's.
3. Open the customer: **Where this came from** says *Imported from SAP*, the
   import (**IMP-…**, which opens it), the SAP customer number and *Customer
   since*. A part from section 4 and a vehicle from section 2 have the same
   box.
4. **Customers** → *Where it came from, and when* → Source *Imported from
   SAP*, *Customer since* to 31/12/2018 → only long-standing SAP customers.
   Add the import number to narrow to one file. Vehicles, Parts and
   Suppliers have the same filter.
5. **Data Exchange → Day by day**: today shows every import started, loaded,
   confirmed and released; a day opens its list.
6. **Headquarters** and **Analytics**: switch between *With SAP history* and
   *EJO only*; the CRM list has the same switch for spend and top spenders.

## 8. Take any list out to Excel, exactly as filtered (A4)

1. As the **Administrator**, open **Customers**, filter as in section 7
   (*Imported from SAP*, *Customer since* to 31/12/2018) and press **Export →
   Excel (.xlsx)**. The file downloads at once: an *About this file* sheet
   (the filters, who, when), then only the matching customers — every one,
   not just the first page — with *Customer since* as a real date, spend as
   numbers with *NGN* beside them, the SAP number with its zeros, and a link
   back to each customer.
2. Under the button: **EXP-…** · *downloaded · N rows*. Press the download
   link again (or open the export and try): *You have already downloaded this
   export* — each link works once per person, for 24 hours.
3. **Parts** (the 50,000 materials of section 4) → **Export → CSV**: the
   whole catalogue in one file. Open it in Excel: ₦ and names display
   correctly, part numbers keep their zeros.
4. A customer's page → *Jobs* → *From SAP, before EJO* → **Export**: that
   customer's SAP invoices, with fiscal year and company code.
5. Sign in as the **Branch administrator**: Vehicles has **Export**,
   Customers does not (contact details need the sensitive-export
   permission). As a **Technician**, no list has Export.
6. **Data Exchange → Exports**: every export, its filters, who downloaded it,
   rows and size. Type the **EXP-** number in search: it opens. *Day by day*
   shows today's exports beside the imports.
7. **A file for SAP's team.** Customers → *Source: Created in EJO* →
   **Export → CSV, SAP field names**. Open it: line 1 is
   *KUNNR, NAME1, KTOKD, SMTP_ADDR, TELF1…*, KUNNR is empty (SAP does not
   have these customers yet), days are YYYYMMDD, and ZZ_EJO_ID is the EJO
   record. *"This is the list for your SAP team to create; EJO never writes
   into SAP. When SAP gives them numbers, the next customers file from SAP
   fills them in."* Do the same on Parts (MATNR, MAKTX, MEINS…) and on a
   customer's SAP invoices (VBELN 0090001001, KUNAG 0001000101: SAP's own
   form, zeros included).
8. **It comes straight back in.** Data Exchange → *Customers* → drop the
   Excel file you exported in step 1, as it is: the *About this file* sheet
   is passed over, every column matches itself, and after the check every
   row shows as *Already a customer* — recognised by its SAP number, never
   added twice. Cancel it.

## 9. One label per vehicle: scan it, open its whole life

Needs the production, QC and PDI registers of section 5 loaded (files 07 and 08).

1. In the search box type **JAANLR85EL7100001** and press Enter (a handheld
   scanner does exactly this). The vehicle's one page opens: an Isuzu NPR 71,
   **From kit to customer** stage by stage — the chassis and trim stations,
   the water test in *Quality audit*, the final inspection and road test in
   *Pre-delivery inspection* — then its customer, Job Cards, Vehicle Services,
   warranties, claims, road tests and gate exits.
2. **Label**: the QR code and the Code 128 barcode of the VIN. Scan the QR
   code with a phone: it opens this page (signing in first if needed, then
   straight back here). One label per vehicle — never per part, kit or
   station; parts are traced through the Store's records.
3. As the **Workshop manager**, print the **Windscreen label** (100 × 60 mm),
   the **Door-jamb label** (90 × 38 mm), the **Traveller sheet** (A4: every
   stage with what is recorded and lines to sign) and the **PDI
   certificate** (A4, for the customer: no staff names; it certifies only
   when every PDI check's latest result is a pass, and otherwise prints as
   *NOT A CERTIFICATE*). Each paper counts its own reprints, and the codes
   never change.
4. Sign in as a **Technician**: the vehicle page opens, the print buttons do
   not. As a **Security officer** at the gate: the page opens; the
   customer's name is for the CRM.
5. A vehicle still in the plant (VIN in the registers, no customer yet) has
   the same page and label: *Not sold yet*.

---

*Coming in the next releases (each adds a section here):* recording PDI on
screen for the Isuzu NQR, NPR, QLR and QMR and the Soueast S07, then kit
arrival and QC, line stations, QA and the yard (D); round-trip updates from an
exported file with a preview of the changes (A4b); bulk PDFs, a customer's
data request and scheduled exports (A4c); the daily SAP files and
reconciliation (C1); and inviting imported customers to the portal (B).
