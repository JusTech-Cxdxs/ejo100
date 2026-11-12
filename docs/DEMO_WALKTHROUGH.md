# Demo walkthrough — EJO 100 beside SAP

A script for showing, live, how EJO 100 answers the questions Kewalram
Chanrai Group raised on 20 October 2026. Every step uses the real system and
invented demo data (no real customer is in these files). It grows with each
release; each section says which release it needs.

**Demo files** are in [`docs/demo/`](demo/), in two folders from the same data:
[`correct/`](demo/correct/) (every row loads cleanly) and
[`with-mistakes/`](demo/with-mistakes/) (the same rows plus planted mistakes,
each listed with its row and what EJO says in that folder's README). This
script uses `with-mistakes/` to show the check catching problems; load
`correct/` when you only want the data in. Regenerate them (same content
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

## 0. The people first (P7)

1. **IT Administrator** → Data Exchange → *Staff* → drop
   `docs/demo/with-mistakes/19_SAP_staff_demo.csv`. The check shows **how
   many people in how many branches** and refuses an administrator role
   (*added by hand on the Users page, never by a file*), an unknown branch
   and role, a malformed employee ID, no email, the same email twice.
2. **Organisation Administrator** approves and loads: twelve accounts,
   **switched off**, nobody emailed — open **Users**: they are there, off.
3. **Send the invitations** on the import: each is switched on and gets the
   welcome with a link to set a password (the addresses are on a domain
   nobody receives mail for: in a real cut-over, their own work addresses).
4. Undo a staff import before inviting: the accounts go to the Recycle bin
   and restore switched off.

## 1. Existing customers from SAP, without retyping (A1)

*The question: "How do years of customers come in?"*

1. **Preparer** → menu **Data Exchange** → *Customers* → **Import customers**.
   Choose *SAP (an export or extract)* and drop
   `docs/demo/with-mistakes/01_SAP_customers_demo.csv` (33 rows, SAP field names:
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
   `docs/demo/with-mistakes/02_vehicles_demo.xlsx` (Isuzu NQR, NPR, QLR, QMR and Soueast S07).
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
   `docs/demo/with-mistakes/05_SAP_suppliers_demo.csv` (SAP vendor layout:
   LIFNR, NAME1…). The check rejects **a supplier with no name** and marks
   **supplier number 0000300041 twice** as a duplicate. Send for approval; the **Store Manager** approves and loads. Open
   **Store → Suppliers**: the list, with SAP vendor numbers.
2. **Parts.** Preparer → *Parts* → choose the branch → drop
   `docs/demo/correct/03_SAP_parts_50k.csv` — **50,000 SAP materials** (MATNR, MAKTX,
   MATKL, MEINS, XCHPF…). Point out:
   - SAP's unit codes become words (ST → Piece, L → Litre, CAR → Carton);
   - lubricants come in as **batch-tracked**, with *1 Drum = 208 Litre*;
   - Group IT cannot approve: only the Store Manager (or an administrator).
   Approve and load as the Store Manager and watch rows a second.
   - Before you start, **Data Exchange → Database space** shows the
     database against its plan (500 MB on the free plan) and about how many
     more parts fit. The 50,000 parts take about 85 MB. A file that would
     not fit, such as a full 800,000-material master on the free plan, is
     refused before it is sent for approval, with how many still fit
     ([FREE_PLAN.md](FREE_PLAN.md)).
   (For a quick first try, `correct/03a_SAP_parts_200.csv` holds 200. Its
   `with-mistakes/` copy adds **no part number**, **no description**, **a
   part number twice** and **a negative price**, which loads without the
   price and says so.)
3. **Store → Parts Catalog**: *Showing 1–50 of 50,000 parts*, paged; search
   "NQR brake" — instant. **Record Goods Receipt**: the part picker searches
   as you type and suggests the imported suppliers.
4. **Opening stock.** Preparer → *Opening stock* → same branch → **Counted
   on** = the cut-over date → drop `docs/demo/with-mistakes/04_SAP_opening_stock_demo.csv`
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
   choose the branch → drop `docs/demo/with-mistakes/06_SAP_invoice_history_demo.csv`
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
   `docs/demo/with-mistakes/07_PDI_register_demo.xlsx` (rejected: one row with
   no VIN, one dated 30 February). Then the same for
   `08_production_QC_register_demo.csv` (it has a *Register* column, so leave
   the choice empty; rejected: a row with no date and one from a "Paint
   shop" register). Workshop manager approves
   both.
7. Open a vehicle from section 2 (Workshop → Vehicles): **Before EJO 100**
   shows its production stations, QC gates (one *Rework* with the reason) and
   PDI steps (OK, or NG with the rectification) with dates and inspectors, and
   its SAP invoices. Inspectors' names are for staff only — the customer
   portal never shows this history.
8. To show it is recoverable: Workshop manager → the invoice import → **Undo
   this import** → the customer's spend drops back; nothing was deleted.
   **Reopen** and load again → the same invoices return, never twice.
9. **Job card history (P4).** The workshop only ever had job cards: a 6-digit
   SAP order number with *Carry out service* or the repair written on it.
   Preparer → Data Exchange → *Job card history* → choose the **workshop**
   (Isolo Branch) → drop
   `docs/demo/with-mistakes/14_SAP_job_card_history_demo.csv` (SAP order list
   layout: AUFNR, AUART, QMNUM, KUNUM, VHVIN, ERDAT, IDAT2, RECDV, KTEXT,
   LTXA1, PERNR, ARBPL, NETWR, VBELN, STAT, WERKS). Point out:
   - every row is a job card; EJO reads the words itself — *Carry out
     service 40,000 km* is also a **service** inside EJO, a repair is not;
   - the check shows **how many job cards, how much, over which dates**;
   - the planted mistakes: an **unknown customer**, **completed before it was
     opened**, **no job number**, **the same job card twice**, **a job card
     still open** (status REL — it belongs in the open job cards file) and
     **a job card of the assembly plant in the workshop's file**.
   Workshop manager approves and loads. Open a customer: **Jobs → Job cards
   before EJO** lists them (the service ones marked); *Visits* counts a job
   card and the invoice it was billed on **once**. Open the vehicle
   (Workshop → Vehicles): **Before EJO 100** shows each job card with its
   mileage, the work, the technician and the invoice. **Service tracker**:
   vehicles whose last service was one of these job cards are tracked from
   it (*482913 (SAP, before EJO)*), with the same interval rules, until EJO
   completes a service of its own. Search the 6-digit number anywhere.
   Exports: **SAP job card history**, in job card format.
10. **Open job cards (P5).** The vehicles in the workshop on the cut-over
    day. Preparer → Data Exchange → *Open job cards* → choose **Isolo
    Branch** → drop `docs/demo/with-mistakes/15_SAP_open_job_cards_demo.csv`
    (eight vehicles from section 2 at every stage: CRTD, REL, awaiting
    parts, QC, awaiting customer approval, TECO, ready for collection — with
    estimates, the parts already issued, deposits and receipt numbers). The
    check shows **how many job cards, the estimates and what is already
    paid**; the planted mistakes: **a closed job card** (CLSD — history), **a
    stage EJO does not know**, **no vehicle**, **the same vehicle twice**, **a
    future date**, **a vehicle EJO does not have**. Workshop manager approves
    and loads; **Finance** confirms the opening payments. Open **Workshop →
    Job Cards**: the eight are live at their stages with EJO numbers; open
    one — the banner says *Brought in from SAP as job card 483203*, the
    estimate reads *approved before EJO* with its *issued before EJO* part
    lines, the payment *Paid before EJO (receipt RCPT-2026-1041)*. Search
    **483203**. Nobody was emailed. **Undo** moves the untouched ones to the
    Recycle bin whole (estimate and payments too); one that has had work
    recorded since stays and is reported.
10b. **Open services and bookings (P6b).** Preparer → Data Exchange →
    *Open services and bookings* → choose **Isolo Branch** → drop
    `docs/demo/with-mistakes/18_SAP_open_services_and_bookings_demo.csv`.
    The check shows **how many bookings (and over which days) and how many
    services already in the workshop**, and refuses a collected service, a
    booking with no day, a vehicle EJO does not have, the same vehicle
    twice, a future check-in day and a row with no number. The Workshop
    manager approves and loads. Open **Workshop → Vehicle Services**: the
    bookings show *Booked 3 Nov 2026, 08:00*; open one — *Booked for …
    Check the vehicle in when it arrives* and *Brought in from SAP as
    booking BK-2026-0600*. Sign in as the front desk and **Check In
    Vehicle**. Search **BK-2026-0600**. Undo: the booking you checked in
    stays; the rest go to the Recycle bin.
11. **Warranties and open claims (P6).** In the demo organisation (its
    workshop demo has the policies). Preparer → Data Exchange → *Warranties
    (sold before EJO)* → drop
    `docs/demo/with-mistakes/16_SAP_warranties_demo.csv` (fourteen vehicles
    from section 2 under the Isuzu and Soueast policies — two with no policy
    named, found from *36 months / 100,000 km* and the provider — most long
    ended and kept for their history, one suspended; four batteries and two
    sets of brake pads fitted before EJO). The check shows **how many on
    vehicles and on parts** and the planted mistakes (no number, a future
    start, an unknown policy, a vehicle EJO does not have, a number twice, an
    unknown status). Sign in as **warranty.hod** and approve: the HOD's
    approval is the second person on every warranty. Open one: *Brought in
    from SAP as warranty W-2024-0425*, active from its start. Then *Open
    warranty claims* →
    `docs/demo/with-mistakes/17_SAP_open_claims_demo.csv`: eight claims, one
    at every stage; the check shows **₦ claimed and ₦ accepted by the
    providers, not yet settled**, and refuses a settled claim, an unknown
    warranty, no complaint, a partial acceptance with no amount, a claim
    number twice. Approve, load, open the claim *With the Warranty HOD* and
    approve it — it moves on to the Manager; the claim *Submitted* shows its
    chain *before EJO*. Search **C-2026-0184**. Undo the claims import: the
    one you approved stays.

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

## 9a. Two branches: the workshop and the Afprint assembly plant (P1)

*The question: "is the plant its own place, like it is in SAP?"*

The deploy opens the plant branch itself where plant records or plant staff
exist (postdeploy 0011). If **Assembly plant** still says *No assembly plant is
in your reach*, an administrator presses **Open the assembly plant now** on
that page: one tap opens Afprint Assembly Plant (SAP plant 1100) with its
departments and moves any plant records and plant staff onto it.

1. **Branches** (as an administrator): *Isolo Branch* is a **Workshop**;
   *Afprint Assembly Plant* is an **Assembly plant · SAP 1100**. Open the
   plant: its kind, its SAP plant code and its departments (Kit receiving &
   plant store, Production, Quality, PDI, Yard & dispatch). Try to change its
   kind to Workshop: refused while it holds plant records.
2. The **branch bar** at the top lists both; the plant carries a factory mark.
   Point it at *Isolo Branch* and open **Assembly plant**: *You are looking at a
   branch that is not an assembly plant* — one tap on *Look at Afprint Assembly
   Plant* switches. **Headquarters** lists both, the plant with its own figures
   (kits at arrival, on the line, at PDI, in the yard).
3. Sign in as the **Kit Inspector** or **PDI Inspector**: their pages name the
   plant; the workshop's job cards are nowhere to be seen. Sign in as the
   **Branch Administrator** of the workshop: the plant pages explain that no
   assembly plant is in their reach, and show nothing.
4. **Organisation structure → Open a new branch**: choose the kind. An
   assembly plant needs its SAP plant code and gets the plant's departments;
   a workshop gets Workshop, Passenger / Commercial Vehicle Workshop and
   Store.

## 10. Pre-delivery inspection on a tablet (D1)

People: a **PDI Inspector** and a **PDI Supervisor** (or the **Plant
Manager**), who work at the Afprint Assembly Plant (SAP plant 1100, section
9a).

1. As the **PDI Inspector**, open **Assembly plant**. Scan a vehicle's label
   (or type a new VIN, e.g. **JAANLR85EL7200001**) and press **Start the
   PDI**. A VIN new to the plant asks for its model (NQR, NPR, QLR, QMR or
   S07), variant, engine number and, if you have them, the SAP material,
   production order and equipment numbers. The checklist for that model
   opens: 54 items for the Isuzu trucks and 56 for the S07, with
   truck-only checks (cab tilt) and SUV-only ones (camera, keyless).
2. Tap through the items. Mark one **Not OK** — it asks what is wrong
   first. Record the odometer, battery and tyre pressures, tick the
   diagnostic scan and type a fault code (*P0401*): the PDI cannot go on
   until the cause is fixed and the code cleared.
3. **Send to rework**. Put the item right (say what was done), press
   **Rechecked OK**, then **Send for approval**. The inspector cannot accept
   their own PDI.
4. As the **PDI Supervisor**, open **Approvals** → *Plant* → the PDI. Try
   **Reject (R)** on one item with a reason: it goes back to the inspector
   (their dashboard says *Put right PDI …*). After the recheck, **Accept
   (A)**: the SAP usage decision is recorded and the vehicle moves to the
   yard.
5. Open the vehicle (its VIN): *Pre-delivery inspection* is **Done** with the
   PDI number; the SAP numbers are on the page. Print the **PDI
   certificate**: it now certifies from this PDI, with every item, and names
   no staff. Search the **PDI-…** number: it opens.
6. **Assembly plant → Vehicles in the plant**: by stage, with the SAP
   numbers; **Export** gives the list (and *Export PDIs* every inspection)
   for SAP or quality reports.

How each record lines up with SAP is in [`docs/SAP_INTEGRATION.md`](SAP_INTEGRATION.md).

## 11. Kits arriving: checked against the packing list, released to the line (D2)

*The question: "a shipment of kits lands — what is missing, and which can go to the line?"*

People: a **Kit Inspector** and a **Quality Supervisor** (or the **Plant
Manager**).

1. As the **Kit Inspector**: **Assembly plant → Record a shipment**. Fill
   in the supplier (*Isuzu Motors Ltd*), the bill of lading, containers and
   the SAP purchase order. For the kits, open
   `docs/demo/with-mistakes/09_kit_packing_list_demo.csv`, copy every line
   and paste it in. Before anything is sent the form says *12 kits ready*
   and lists the four bad lines: **a part name where the VIN should be**,
   **a VIN twice**, **a D-MAX** (not built here) and **900 cases**. Press
   *Record the shipment*: *Nothing was saved*. Paste
   `docs/demo/correct/09_kit_packing_list_demo.csv` instead, and it records
   the shipment with its 12 kits (8 Isuzu CKD, 4 Soueast S07 SKD).
2. Open the first kit. Tap through the checks. Mark **Case count matches the
   packing list** Not OK (*Case 07 missing*) and type **13** cases arrived
   (the packing list says 14). Under *Shortages and damage*, raise the
   front axle hubs (part **8-97366-430-0**, case C07, quantity 2) and tick
   **It stops the line**. Raise a mirror bracket too, which doesn't stop
   the line. **Send for release**: the inspector cannot release their own
   kit.
3. In the PDI bay, try to start a PDI on that VIN: *its kit has not been
   released to the line yet*.
4. As the **Quality Supervisor**: **Approvals → Plant → Release kit …**.
   Release is refused while a shortage stops the line, so **Hold** it with
   a note. On the hub shortage, type the claim reference and press
   **Claimed**, then **Resolved** (*arrived by air freight*). The inspector
   sends it again. One shortage is still open, so releasing needs a written
   concession (*fitted at the trim station when they arrive*). Press
   **Release with shortages (A)**: the vehicle is created **on the line**.
5. Reject another kit (**Reject (R)**, e.g. *cab crushed in transit*): it is
   final, and that VIN will not be built.
6. Open the released VIN: *Kit arrival and QC* shows the kit, the shipment
   and the open shortage. Search the **KIT-…** or **SHP-…** number. **Kits →
   Export shortages** gives the list for the supplier claim, with part, case,
   quantity and the SAP purchase order.

## 12. The line: stations, checks, defects, the gate and the QA audit (D3)

*The question: "where is every vehicle on the line right now, what is wrong
with it, and does anything leave the line that should not?"*

People: a **Production Supervisor**, a **Line Operator**, a **QC Inspector**
and a **QA Auditor** (the **Plant Manager** and **Quality Supervisor** can do
all of it).

1. As the **Production Supervisor**: **Assembly plant → The line**. The
   board shows one column per station of the live routes (the Isuzu
   truck line C1, C2, C3, E1, R1, G1 — the simple line Kewalram runs: the
   kit's chassis arrives as built, so the line is *chassis on the line →
   cab fitted → fluids, battery and first start*, then the tests, the road
   test and the gate; the Soueast S07 line B1…G1, fuller), every VIN at its station
   with its minutes there and its open defects, and the figures: on the line,
   in rework, passed today, **first-time-through** and **defects per unit**
   over 30 days, open A-defects. A vehicle released from its kit but not yet
   started is listed below: press **Start the build** and the route becomes
   its stations.
2. As the **Line Operator** on a tablet, open the vehicle. Stations run in
   order: trying C2 before C1 is refused. At **C1 Chassis on the line**, tap
   each check Pass; type **150** for the spring U-bolt torque (limits
   200–240 N·m) — it fails at once. *Finish the station* is refused until
   the defect is raised: **Axles and suspension · Loose / under torque ·
   Tool: torque setting**, which the catalogue grades **A (safety)**. The station is
   now *Failed, in rework*. Type what was done and press **Reworked**: the
   operator cannot verify their own rework.
3. As the **QC Inspector**: **Approvals → Plant → Verify rework DEF-…** →
   **Verified: close** (or *Still wrong*, with a note, which reopens it).
   Back as the operator, re-record the torque (**200**) and finish C1:
   *Passed*. Work C2 (the cab) and C3 (fluids and first start), then the
   end-of-line tests and the road test. A plant whose kit comes less
   complete adds stations under **Routes** (step 6).
4. At **G1 Final inspection** the operator records the gate's checks and
   presses *Finish the gate checks*. The gate itself is passed by quality,
   never by whoever recorded its checks, and never while an A- or B-defect
   is open: raise a **B** (reverse lamp bulb missing) and a **C** (scratch)
   on the walk-round — the gate says *1 B-defect is open: fix before the
   gate*; the C does not stop it. Rework, verify, then as the QC Inspector
   press **Pass the gate: ready for PDI**. The vehicle is at stage *Quality
   audit* and appears in the PDI bay's *Start a PDI* list.
5. As the **QA Auditor**: **The line → QA audits**. Pick the vehicle from
   *Passed the gate, not yet audited* and walk it section by section
   (exterior, interior, engine bay, under-body, electrical, documents). An
   **A** finding (10 demerits) or 20 demerits fails the audit; a failed audit
   raises every finding as a defect, fails the gate and sends the vehicle
   back to the line. A clean audit passes and is kept with its score.
6. The **Production Supervisor** edits a route under **Routes**: the stations
   and checks as text (`# C1 | Chassis on the line | STATION | 40 min`, then
   one check per line, measurements with unit and limits). Problems show as
   you type and nothing saves while one remains; saving makes a new version,
   and vehicles already on the line keep the version they started with.
7. Open the vehicle's page: every station it passed, each test, the gate and
   the QA audit are in its life. Search a **DEF-…** or **QAA-…** number.
   **Export stations**, **Export defects** and **Export QA audits** give the
   SAP-ready lists (work centre, confirmation, QM defect codes).

## 13. Six weeks of the plant in one tap: the plant demo (P3)

*The question: "show me the plant running — not an empty board."*

People: an **Administrator** (the demo people are invented; they appear on
the records and have no sign-in).

1. As the **Administrator**: **Assembly plant → Demo records → Load the
   plant demo**, type **load the demo**, press **Load the demo as of now**.
   In a few seconds the plant holds six invented weeks ending this minute:
   seven shipments (Isuzu CKD from Yokohama, Soueast SKD from Xiamen — bills
   of lading, vessels, containers, SAP purchase orders and inbound
   deliveries), 80 kits with their arrival checks, cases, lots, SAP
   inspection lots and material documents, about 65 vehicles — kits still
   on the bay, one on hold for a line-stopping shortage claimed from the
   supplier, one rejected (cab crushed), vehicles at their stations with
   one in rework, a failed QA audit back at the gate, vehicles waiting for
   PDI, PDIs in progress and a yard — with realistic takt, first-time-through
   and defects per unit.
2. Walk the pages: **The line** (every column busy, the figures and the top
   defects filled), **Kits** and **Shipments**, **QA audits**,
   **Headquarters** (both branches with their figures), any vehicle's page
   (its kit, every station, the gate, the audit, its PDI), search by any
   KIT-, SHP-, DEF-, QAA- or PDI- number, and the exports.
3. The demo is marked **EJO-DEMO**. Loading it again replaces it (as of the
   new moment); **remove the demo** takes exactly those records out and
   nothing a person made. Both are audited. The same thing from a terminal:
   `npm run demo:reset` (refused against a hosted database unless
   `DEMO_RESET_CONFIRM` is set — see
   [DATA_MIGRATION.md](DATA_MIGRATION.md)).
4. The same six weeks are in `docs/demo/correct/` as files
   (`10_plant_shipments_demo.csv` … `13_plant_vehicles_demo.csv`), in the
   layouts the plant records import reads — the next section loads them
   that way instead.

## 13b. The plant's records at the cut-over: four files (P8)

*The question: "our plant is already running — how do the kits on the
floor and the trucks on the line get into EJO?"*

People: the **IT Administrator** prepares, the **Plant Manager** approves.
Use an organisation without the plant demo loaded (the files are the same
VINs), with the staff of 19 in first (§0: the inspectors and deciders are
named by employee ID).

1. **Data Exchange → Plant shipments**, into **Afprint Assembly Plant**:
   upload `docs/demo/with-mistakes/10_plant_shipments_demo.csv`. The check
   refuses a shipment with no supplier and one arriving in 2027, marks the
   same shipment twice, and says what will load: *To bring into Afprint
   Assembly Plant: 12 shipments · arrived …*. Send for approval; sign in as
   the Plant Manager, approve and load. Each is an SHP shipment, its old
   reference (SHP1…) kept.
2. **Plant vehicles** — `13_plant_vehicles_demo.csv`: a sold vehicle, a
   vehicle waiting for PDI with no gate day and a D-MAX are refused. The
   totals count them by stage (on the line, in quality audit, waiting for
   PDI, in the yard). Load: **The line** shows the three on the line at
   their stations, the ones before done *before EJO*; a yard vehicle's page
   shows every station passed and the gate passed before EJO.
3. **Plant kits** — `11_plant_kits_demo.csv`: a cancelled kit is refused and
   a shipment not in file 10 (SHP77) is refused against what EJO holds.
   Load: **Kits** shows the ones still to check and the one on hold; a
   released kit's page shows its checklist *Checked before EJO* and its
   vehicle; the released kits still waiting for a line slot say so.
4. **Plant kit issues** — `12_plant_kit_issues_demo.csv`: a kind EJO does
   not know, an issue with no description and one on a kit EJO does not
   have are refused. Load: the open shortages are back on their kits, the
   line-stoppers marked.
5. **Undo, in reverse.** Undo the kits import first: the kits with issues
   stay (*kept*) and the others go to the Recycle bin. Undo the issues,
   then restore a kit from **Recycle bin** — it comes back with its
   checklist and its KIT number.

## 13c. The cut-over checklist (P9)

*The question: "how do we know a branch is ready to switch off the old
system?"*

People: the **Plant Manager** (or the Manager at Isolo, or an administrator).

1. **Data Exchange → Cut-over checklist**: every branch with *n of m steps
   settled* and a bar; a branch signed off shows *Cut over* with the day.
2. Open **Afprint Assembly Plant**: staff, plant shipments, plant vehicles,
   plant kits, plant kit issues — in the order they load, each with its
   state from its imports, how many records it added and links to them.
   The next one to do is outlined.
3. On **Plant kit issues**, *Not needed here*: a word like *n/a* is refused
   (*Say why this branch has none*); *No open shortages on the day* is
   kept, with your name and the time, and appears under **History**.
   *Needed after all* takes it back.
4. When every step is settled, **Sign off Afprint Assembly Plant as cut
   over**: the checklist as it stood is kept with the sign-off in the audit
   trail. *Reopen*, with a reason, for a file that has to be loaded again.
5. Sign in as the IT Administrator: the same checklist, without the marks
   or the sign-off — preparing files is not approving them.

## 13d. An edited export comes back as updates (P10)

*The question: "SAP has the new phone numbers — do we retype them?"*

People: the **IT Administrator** prepares, the **Workshop Manager** approves.

1. **Customers → Export → Excel**. In Excel change two customers' addresses and
   the first one's phone, write another customer's phone as *+234 …*
   instead of *0…*; clear one customer's second phone.
2. **Data Exchange → Customers**, upload the file. Choose **Update customers
   exported from EJO**: the *EJO record* column is matched by itself.
3. The check lists **To change: 2 customers · 3 fields**, each as *from →
   to*. The phone written the other way is no change; the cleared second
   phone is left as it is (a file never blanks a field).
4. Before approving, change one of those customers' phone at the desk. Then
   approve and load as the Workshop Manager: that phone is *changed in EJO
   since the check: left as it is*; the rest are made, and each customer's
   history shows the change with the import's number.
5. **Undo this import**: each field goes back to what it was.

## 13e. Postings for SAP, and SAP's answers (C1a)

*The question: "we keep SAP for the books — how does it learn what the
workshop did?"*

People: the **Finance Officer** makes the files, the **Workshop Manager**
records SAP's answers. The branch must be signed off as cut over (§13c), and
have its SAP plant code (WERKS) on its page.

1. Record a payment on a job card and close another job card.
2. **Data Exchange → Postings for SAP**: the branch's table shows, per kind,
   what is *not in a file yet*, *sent*, *posted* and *rejected*, with amounts.
3. Choose **Payments**, up to yesterday, **Make the file for SAP**: its page
   shows the lines, the total and the **SHA-256**. **Download for SAP** —
   line 1 is the header; days read 20261110; KUNNR has its leading zeros.
4. As the Manager, load SAP's return file (ZZ_EJO_LINE, STATUS, BELNR,
   MESSAGE): one line *S* with a document number, one *E* with SAP's message.
   The lines show *Posted in SAP* (with the document) and *Rejected by SAP*
   (with the message). Load it again: *already recorded*, nothing changes.
5. **Send again** on the rejected line; the next payments file carries it,
   and the old line reads *Sent again*.

## 13f. The plant and refunds in SAP's files; SAP's master data back in (C1b)

*The question: "and the plant? and when SAP changes a customer?"*

People: the **Plant Manager** at the plant, **Finance** at the workshop, the
**IT Administrator** and the **Workshop Manager** for SAP's file. Each branch
signed off as cut over (§13c), with its SAP plant code.

1. At the plant, reject a submitted PDI back to rework, put it right and
   accept it. **Postings for SAP → Afprint**: **PDI usage decisions** makes a
   file with two lines for it, *R* then *A*; AUFNR and EQUNR carry SAP's
   zeros. **Vehicles to the yard** has it once (movement 101 from its
   production order); the next file never has it again.
2. Load SAP's return file for the decisions; open the PDI: **Sent to SAP**
   shows each decision *Posted in SAP* with its document, and the yard
   receipt *waiting for SAP*.
3. At the workshop, record a refund on a job card; **Refunds** makes a file
   with its number, the job and the reason. The job card's page shows it
   under **Sent to SAP**. (Front desk and technicians do not see that box.)
4. As the IT Administrator, upload SAP's own customer extract — KUNNR (with
   its zeros), name, phone, no EJO record column — choose **Update customers
   exported from EJO, or from SAP's own file**: each row is found by its SAP
   number only; a number EJO does not have is refused; every change is
   previewed, then approved by the Manager (as §13d).

## 14. Sign in as anyone: the demo people (D1)

*The question: "let me see it as the technician — and as the director."*

People: everyone. [KEWALRAM_DEMO.md](KEWALRAM_DEMO.md) lists every sign-in:
eight at **Headquarters** (Organisation Administrator, Executive, IT
Administrator, Finance Officer, Customer Care Lead, Broadcaster, Scheduling
Admin, Calendar User), seventeen at **Isolo Branch** (Branch Administrator,
the Manager, two Workshop Supervisors — passenger and commercial — two
Technicians, Front Desk, Branch Assistant, Store Manager and Officer,
Finance, Warranty HOD and Officer, the Chief Security Officer and the gate,
Customer Care, a Department Head) and sixteen at **Afprint** (Branch
Administrator, Plant Manager, Production Supervisor, four Line Operators,
QC, Quality Supervisor, QA Auditor, two Kit Inspectors, PDI Inspector and
Supervisor, the kit store, the plant gate), plus four customer-portal
sign-ins. All invented, all on the reserved `demo.kewalram.local` name,
employee numbers `DEMO-…`.

1. The one password is `DEMO_STAFF_PASSWORD` in the hosting environment
   (never in code or in this document). Set it, redeploy: the build makes
   the accounts; a later build changes nothing. Or `npm run demo:people`.
2. Sign in as `tech.passenger@demo.kewalram.local`: his dashboard, only
   the jobs assigned to him, no plant. As `operator.1@…`: the line board
   and his station, no job cards. As `finance.hq@…`: every branch's money
   in view, nothing to confirm. As `admin@…`: both branches, the set-up,
   the audit trail — and no job to open.
3. In the customer portal, `customer.adaora@demo.kewalram.local` (an
   individual) or `customer.fleet@…` (a fleet company) sign in with the
   same password (or `DEMO_CUSTOMER_PASSWORD`).
4. The plant's people here are the ones §13 puts on the line: one set of
   accounts. Their records in the workshop — six months of job cards,
   services, the store, warranty, security, support — are §15.

## 15. Six months of the workshop in one go: the workshop demo (D2)

*The question: "show me the workshop as it is on a Tuesday morning — not an
empty list."*

People: everyone at Isolo (§14); the Administrator loads it.

1. The demo organisation gets its records once, by itself: the production
   build (when `DEMO_STAFF_PASSWORD` is set) runs `npm run demo:ensure` after
   the demo people — the plant's six weeks (§13) and then **six months of
   Isolo Branch** as of that minute. From a terminal: `npm run demo:reset`
   (people → plant → workshop; refused against a hosted database unless
   `DEMO_RESET_CONFIRM` is set). Every record it makes is listed in
   `demo_records`, so a reload or `-- --remove` takes out exactly those and
   nothing a person made — even the demo's own audit entries, under the
   trail's recorded maintenance switch, so a job card's history is never
   doubled.
2. As the **Manager** (`manager@demo.kewalram.local`): the dashboard, then
   **Workshop → Job cards**: about 175 over six months and, today, one at
   every status — checked in this morning, waiting for the customer's
   approval (one nine days overdue, with its reminder), in progress,
   waiting for parts (the slip with the HOD, with the store, approved and
   reserved), at quality check (one sent back for rework, in the history),
   completed, ready for collection, closed, checked out, and cancelled
   (one with its refund). Open any: the complaint, the diagnosis, the
   estimate with labour, store parts matched to the catalogue, an outside
   part or job, the parts slip and what the store issued (batch numbers for
   oil, serial numbers for batteries), the 70% deposit that started the
   work and the balance at collection, the close request, the gate exit.
3. **Vehicle services**: ~80 services, every status, the inspection on each
   (a few items needing attention), the service estimate, two escalated
   into job cards, the **service tracker** with the next service due from
   each completed one and three reminders sent.
4. As the **Store Manager**: stock from 35 goods receipts (an opening count
   and monthly orders from six suppliers), four parts **below their reorder
   point**, two open **pricing alerts** (an injector bought at a loss, pads
   that ate the margin) and two resolved ones, batches with what is left,
   serials in stock and issued.
5. As the **Warranty HOD**: four providers and policies, the makers'
   warranties on the Afprint-built and newer vehicles (one waiting for
   verification), part warranties made automatically for every battery and
   pad set issued, and **nine claims, one at each stage** from draft to
   settled — the warranty customer's is the submitted one.
6. As the **Chief Security Officer**: **Security → Overdue** shows the
   insurance assessor three hours past his time and the Store Officer out
   on an exit pass past its return; a visitor just in, two expected, a
   delivery at the gate and one expected, the roofing contractor's team on
   site, an open incident from this morning, 40 road tests on the job
   cards that needed one.
7. **Scheduling, broadcasts, support**: today's appointments in the two
   rooms, a branch notice about Saturday's generator service, a greeting
   for the new month, the Support centre with an open complaint about a
   scratch, a staff *Get help* about the scanner, replies drafted by Enyo.
8. **Data Exchange**: the seven completed imports of the cut-over
   (customers, equipment, vendors, materials, stock with Finance's
   sign-off, invoices, job card history) and four exports.
9. The six oldest vehicles in the plant demo's yard are **sold** through
   Isolo — the plant vehicle points at the customer's vehicle — with the
   maker's warranty and their first service; `/vehicles/<VIN>` reads from
   the kit to that service. The four portal customers each have their story
   (§14).

## 16. A new working day every day, and the platform team's button (D3)

*The question: "if I open the demo next Tuesday, is it still today?"*

People: anyone in the demo; the **Master Administrator** (platform team) for
the button.

1. Every day the demo gets a working day of its own, dated today (Lagos):
   three vehicles checked in this morning at Isolo (one on Saturday, none
   on Sunday), a service checked in and one booked for the next working
   day, two visitors expected (one already in), the morning workshop
   meeting, two new support requests with Enyo's acknowledgement, and on
   Mondays a notice to Isolo, *This week in the workshop* — never emailed.
2. The days before move on by themselves, one safe step a day: yesterday's
   check-ins are accepted by their technician with an estimate written; two
   days later the supervisor approves it — and then it **waits for the demo
   Manager**, so `manager@demo.kewalram.local` always has real approvals to
   give. Yesterday's visitors are signed out, yesterday's requests answered;
   a check-in nobody moved for a week is cancelled (the customer did not
   come back), a week-old request resolved. The pulse never touches money,
   stock, parts slips, warranty or the plant.
3. It runs at most once a Lagos day, whichever comes first: the daily
   07:00 UTC job, the first dashboard opened that day (after the page is
   shown, never in its way), or a deploy. A fresh load counts as the day.
   `DEMO_DAILY_ACTIVITY=off` stops it. `npm run demo:pulse` runs it by hand
   (`-- --at <date>` to rehearse another day). Only an organisation marked
   as a demo is ever touched.
4. As the **Master Administrator**: **IT control room → Demo organisation**.
   Each organisation is listed as *Demo* or *Real organisation*. For the
   demo: its record counts, sign-ins, when it was loaded and its last
   working day; type **refresh the demo** and press **Load / refresh the
   demo now** to load it all again as of this minute (people → plant →
   workshop; a few minutes on a hosted database), **remove the demo** to
   take its records out, or the organisation's short name to unmark it (its
   demo sign-ins are switched off on the spot). To make another
   organisation the demo, type its short name. Everything is audited; the
   IT Administrator and an organisation's own Administrator never see the
   card.

## 17. The role tour: who to sign in as, and what they cannot do (D4)

*The question: "show me it's really locked down — role by role."*

[KEWALRAM_DEMO.md](KEWALRAM_DEMO.md) opens with **the 15-minute tour for
the directors** — ten sign-ins in order, from the Executive's daily brief
through the front desk, a technician, the Manager's approvals, the store,
warranty, the line at Afprint, the security desk and the customer portal,
ending with the Administrator's audit trail — and then lists every one of
the 41 demo people with what they see first, three clicks that show their
job and the pages they **must not** open. Try any of those: the portal
answers *Access denied*. Every line is checked against the authorization
catalogue by a unit test and in the browser by an e2e test that signs in
as each person.

---

*Coming in the next releases (each adds a section here):* the yard, sale and
plant dashboards (D4); the job-card, service, warranty, staff and plant
records imports are in (§13b) with the cut-over checklist (§13c), and round-trip updates from an
exported file (§13d); bulk PDFs, a customer's
data request and scheduled exports (A4c); the daily SAP files and
reconciliation (C1a §13e and C1b §13f are in); and inviting imported customers to the portal (B).
