# Data migration — bringing existing records into EJO 100

How an organisation's existing data — years of customers and vehicles, the
suppliers, the parts catalogue (SAP material master), the stock each branch
holds, the invoices from SAP and the plant's production, QC and PDI
registers — comes into EJO 100 from SAP and from spreadsheets, **without
retyping and without risk to the live records**.

> Status: **A3.** Customers, vehicles (A1); suppliers, parts, opening stock
> (A2); SAP history — customer-since dates, invoice history, production / QC
> / PDI registers (A3). Coming next: A4 export from every list.

## 1. The principle

EJO 100 is the operations layer **beside** SAP; SAP stays the system of
record for finance, procurement, the general ledger and the material master.
An import copies records **into** EJO. It never writes to SAP, and it never
overwrites a record that is already in EJO.

Every import goes through the same six steps, in the portal at
**Data Exchange** (`/data-exchange`):

| Step | What happens | Live records changed? |
| --- | --- | --- |
| 1. Upload | The file is read **in the browser** and sent in small blocks to a staging area. Any size up to a million rows; an interrupted upload is started again and nothing is counted twice. | No |
| 2. Match columns | Each column is matched to a field by its name. **SAP field names match themselves** (KUNNR, NAME1, TELF1, SMTP_ADDR, STRAS…). The matching can be saved as a profile ("SAP customer master") for the next file. | No |
| 3. Check | Every row is checked with the **same rules as the front desk's own forms**, and matched against what is already in EJO. Result: ready, ready with a note, rejected, duplicate in the file, already in EJO. Rejected rows download as a file with a *Problem* column, to fix in Excel and upload again. | No |
| 4. Approve | A **second person** approves. The person who prepared the import cannot approve it (the platform administrator may, while nobody else holds the role; this is recorded). | No |
| 5. Load | Rows load in batches of 1,000. Each batch is all-or-nothing; the import is locked so two screens can never load it twice; it can be paused and resumed; a failed batch pauses the import with nothing saved from it. | Yes |
| 6. Report and undo | The report adds up: rows in the file = added + filled in + not added + rejected. The full row-by-row outcome downloads as a file. **Undo** moves exactly what the import added to the **Recycle bin** — each record its own item, restorable for the bin's retention period (30 days by default) — and empties only the fields it filled in. It is refused while any work has been recorded on those records since. | Undo reverses it (recoverably) |

Every step is in the audit trail (*Data exchange …* entries) with who, when
and the counts. The staged copy of the file is kept with its import; it is
deleted at once if the import is cancelled, and released once the import is
finished (section 9a).

## 2. Who does what

| Role | Prepare (upload, match, check, send for approval) | Approve, load, send back, undo |
| --- | --- | --- |
| Administrator (headquarters) | Yes | Yes, everything (never their own) |
| Group IT administrator | Yes | — (the business approves what goes in) |
| Branch administrator | Yes | — |
| Workshop manager | — | Customers, vehicles and invoice history of their branch; production / QC / PDI registers |
| Customer care lead | — | Customers, vehicles and invoice history |
| Store manager | — | Suppliers, parts and opening stock of their branch |
| Finance officer | — | — · **confirms the totals** of loaded opening stock and invoice history |
| Everyone else (front desk, technicians, security…) | — | — |

Each kind of record is approved by the **department that owns it**: approving
customers also needs the right to manage customers; approving suppliers,
parts and stock needs the right to manage the Store's parts. Opening stock
and invoice history have a second signature: after they load, someone in
**Finance** (not the person who prepared or approved it) confirms the totals.
Finance opens those two kinds of import only — never a customers file.

## 3. Customers

**Template:** Data Exchange → Customers → *Excel template* (with an
Instructions sheet and dropdowns) or *CSV template*.

| Field | Required | Recognised column names (examples) |
| --- | --- | --- |
| Customer number (SAP or old system) | — | KUNNR, PARTNER, BU_PARTNER, customer number, account number |
| Name | **Yes** | NAME1, NAME_ORG1, name, customer name |
| Name, second line | — | NAME2, NAME_ORG2 |
| Type | — | Individual / Organisation (empty: Organisation when a company name is given) |
| Company name | — | company, organisation |
| Email | — | SMTP_ADDR, email, e-mail |
| Phone / Second phone | — | TELF1, TEL_NUMBER, mobile / TELF2, MOB_NUMBER |
| Address, City, State | — | STRAS, STREET / ORT01, CITY1 / REGIO |
| Tax ID | — | STCD1, STCEG, TIN |
| Tags | — | tags, group, KDGRP |
| Customer since | — | ERDAT, CRDAT, created on, customer since, first purchase |

**Customer since.** SAP's creation date of the business partner (ERDAT —
written 20140602, 02.06.2014, 02/06/2014 or 2014-06-02) becomes the
customer's *customer since*. The CRM shows it ("Customer since 02/06/2014
(from SAP, customer 1000123) · in EJO 100 since …"), the newest-first list
sorts by it, and **new customers** — the CRM's *New this month* and
Headquarters' *New customers* — count people new to the business, not new
to the system: a long-standing customer imported today is not "new". A date
that cannot be read is a note (the import day is used), never a rejection.

**Matching an existing customer**, in this order: the customer number (from
the same source), then the email, then the phone.

- A match by number or email is **certain**: the customer is left as they
  are, or — if *fill in only empty fields* was chosen — gets only the fields
  that were empty. Nothing is ever overwritten.
- A match by **phone only** is a **possible duplicate** (families and fleets
  share phones). By default it is **not** added and is listed under
  *Possible duplicates* (with a link to the existing customer, and as a
  download) for someone to follow up. It is never merged silently.

**Old data with gaps loads with a note, not a rejection**: no phone, no
address, an email that is not valid (the customer is kept **without** it),
several emails in one cell (the first is kept), an address longer than the
80-character printed line (the line is shortened; the full address is kept as
an extra address). Only a row with **no name** is rejected.

**Customers without an email** are full customer records — job cards,
vehicles, warranties, history — reached by phone. They have no customer
portal access until their own email is added on their page. EJO never uses a
made-up or placeholder address. An email already registered for another
organisation on the platform is left off the new customer.

## 4. Vehicles

Load the **customers file first**: each vehicle is linked to its customer by
the customer number, email or phone.

| Field | Required | Recognised column names (examples) |
| --- | --- | --- |
| Customer number / email / phone | **one of them** | KUNNR, customer number / customer email / customer phone |
| Vehicle number (SAP or old system) | — | EQUNR, equipment number, fleet number |
| Chassis number (VIN) | **VIN or plate** | VIN, VHVIN, chassis number |
| Plate number | **VIN or plate** | plate, registration, LICENSE_NUM |
| Engine number, Engine type | — | engine number / engine type |
| Make, Model, Year | — | make, brand / model / year, model year |
| Passenger or Commercial | — | category (empty: worked out from the model — NQR, NPR, QLR, QMR are commercial; S07 is passenger) |
| Mileage (km) | — | mileage, odometer |

**Matching:** vehicle number (within the organisation), then VIN, then plate.
VINs and plates are unique on the platform: one registered for another
organisation is rejected. A VIN that is not the standard 17 characters is
kept as written, with a note.

## 5. Suppliers

The organisation's supplier list (SAP vendors), shared by every branch, at
**Store → Suppliers**. Goods receipts link to a supplier when the name
typed matches one, and the receipt form suggests suppliers as you type.

| Field | Required | Recognised column names (examples) |
| --- | --- | --- |
| Supplier number | — | LIFNR, vendor number, creditor |
| Name (+ second line) | **Yes** | NAME1 (+ NAME2), supplier name |
| Contact, phone, email | — | contact person / TELF1 / SMTP_ADDR |
| Address, city, tax ID | — | STRAS / ORT01 / STCD1 |

Matched by supplier number, then by name. Undo moves imported suppliers to
the Recycle bin (refused for any that goods receipts already name).

## 6. Parts (the SAP material master)

Into **one branch's** catalogue, chosen when the import starts.

| Field | Required | Recognised column names (examples) |
| --- | --- | --- |
| Part number | **Yes** | MATNR, material number, part number, item code |
| Description | **Yes** | MAKTX, material description |
| Material group / category | — | MATKL, material group |
| Base unit | — (Piece) | MEINS — SAP codes become words: ST/PC → Piece, EA → Each, L → Litre, KG → Kilogram, CAR → Carton, DR → Drum… |
| Tracking | — (Quantity) | XCHPF = X → Batch; a serial profile (SERNP) → Serial |
| Barcode, selling price | — | EAN11 / price |
| Reorder point, safety stock | — | MINBE / EISBE |
| Alternative unit + base units in it | — | MEINH + UMREZ (e.g. Drum = 208 Litre) |
| Number in SAP, if different | — | BISMT (old material number). From SAP and empty: the part number. |

Matched by SAP number, then part number (any case). New parts are added with
their alternative unit; an existing part is left as it is, or gets only its
empty fields filled — never its stock, unit or tracking. Undo moves imported
parts to the Recycle bin (refused for any that have stock, receipts or
issues — reverse an opening-stock import first).

**Large catalogues stay fast:** the Parts list is paged (50 a page, with the
total), the goods-receipt form searches parts as you type instead of loading
the catalogue, and the stock tools ask the database for the low parts only.

## 7. Opening stock

What each part of one branch held **at the cut-over**, with its cost — from
the SAP stock and valuation report (MB52 / MC.9 / the material valuation).

| Field | Required | Recognised column names (examples) |
| --- | --- | --- |
| Part number | **Yes** | MATNR — the part must already be in the branch's catalogue |
| Quantity on hand | **Yes** | LABST (unrestricted stock) |
| Unit | — (base unit) | MEINS — the base unit or the part's alternative unit |
| Stock value | **This or the unit cost** | SALK3 |
| Unit cost (+ price unit) | **This or the stock value** | VERPR / STPRS (+ PEINH: a price per 100 has 100) |
| Batch | for batch parts | CHARG |
| Serial numbers | for serial parts | SERNR, separated by commas or semicolons |
| Storage location | — | LGORT (kept on the receipt's notes; the same batch in two locations is added together) |

- **Before approval**, the check shows the lines, units and **total value**
  that will load, to compare with the SAP report for the same plant and date.
- Loaded as **opening-balance goods receipts** (one per batch of lines),
  numbered like any receipt (GRN-…), dated at the **cut-over date** chosen at
  upload, supplier *Opening balance — SAP (IMP-…)*. So **stock on hand, FIFO
  cost layers, stock value and the inventory analytics** count it exactly
  like a delivery; ageing starts from the cut-over date.
- Only for parts with **no stock history** yet (no deliveries, stock on hand
  or issues); otherwise the line is rejected — record a goods receipt instead.
  Negative stock, a zero quantity, no cost, a batch part without its batch,
  serial numbers that do not match the quantity or already exist: rejected.
- After loading, the report shows the value now on the shelves and whether it
  **matches the checked file exactly**; **Finance confirms** it.
- **Reversal** takes the stock back off the shelves and removes the
  opening-balance receipts — refused once anything has been issued or
  reserved from them. The file stays in the import: **Reopen** checks it again
  and it needs a fresh approval to load.

## 7a. Invoice history from SAP (before EJO)

The invoices each customer had in SAP before EJO 100 came in, so a
long-standing customer does not look new: **read-only history** that counts
in the customer's **lifetime spend, visits and last visit**, in the CRM list
(spend, *spend this year*, top spenders, last visit) and in **Headquarters**
and the analytics, always labelled **"From SAP, before EJO"**.

Load the **customers file first** (and the vehicles, to link invoices to
them). Choose the **branch** whose sales they were.

| Field | Required | Recognised column names (examples) |
| --- | --- | --- |
| Invoice number | **Yes** | VBELN (billing document), BELNR (accounting document), invoice number |
| Invoice date | **Yes** | FKDAT, BUDAT, BLDAT, invoice date |
| Customer number (SAP) | **Yes**, or the phone | KUNAG (sold-to), KUNRG (payer), KUNNR |
| Amount (₦) | **Yes** | NETWR (net value), DMBTR / WRBTR (line item), amount, total |
| Tax (₦) | — | MWSBK — added to a net amount, so the history is gross |
| Currency | — | WAERK, WAERS — naira only (give DMBTR, the company-currency amount, for others) |
| Chassis number (VIN) | — | VHVIN, VIN, chassis — links the invoice to the vehicle |
| Document type, Description | — | FKART / BLART (F2 invoice, G2 credit), ARKTX / SGTXT |

From SAP: a billing-document list (VF05, or table VBRK with its customer and
vehicle) or the customer line items (FBL5N), exported to Excel.

- **Each invoice number loads once.** Loading the same file again adds
  nothing; an invoice already in the history is *Already in the history*.
- **Credit notes** (a negative amount — SAP's `20000-` is understood) reduce
  the customer's total.
- **Rejected:** no invoice number, no date or a date that is not a real day,
  a date in the future, no amount, a currency other than naira, a customer
  who is not in EJO. **A note:** a VIN that is not a vehicle in EJO yet (the
  invoice stays on the customer).
- **What the history is not:** it is never edited, paid, refunded or
  "outstanding"; it is not in EJO's own sales, margins, average job or
  projections (those stay EJO's work); and it is **never shown to the
  customer** in the customer portal.
- **The check shows the totals** — invoices, amount, first and last date — to
  compare with SAP's report for the same period before approving; Finance
  confirms them after the load.

Where it shows: the customer's page (*Lifetime spend* "incl. ₦… from SAP,
before EJO", *Visits*, the 12-month chart, and **Jobs → From SAP, before
EJO** with every invoice); the CRM list and its KPIs; the vehicle's page
(*Before EJO 100*); Headquarters (each branch's *Collected* shows "+ ₦… in
SAP" for the period, and a line under the figures) and the analytics' top
customers.

## 7b. Production, QC and PDI registers

The plant's existing Excel registers — the production line, quality checks
and pre-delivery inspections — one row per vehicle per check. Read-only
history, shown on each vehicle's page under **Before EJO 100**, by its VIN
(the vehicle can be a customer's or still in stock).

| Field | Required | Recognised column names (examples) |
| --- | --- | --- |
| Chassis number (VIN) | **Yes** | VIN, VHVIN, chassis, frame number |
| Register | **Yes**, or chosen when importing | register, check type — Production, QC (quality), PDI (pre-delivery) |
| Date | **Yes** | date, PDI date, inspection date, production date |
| Model | — | model, variant |
| Station / step | — | station, step, gate, checkpoint |
| Result | — | result, status — OK / Pass, NG / Fail, Rework (kept as written otherwise) |
| Inspector | — | inspected by, checked by — **staff only**, never shown to customers |
| Reference, Notes | — | report no, sheet number / remarks, defects, findings |

A file that is one register only (a "PDI register" workbook) needs no
*Register* column: choose **Which register is this file?** when importing.
The same check (register, VIN, date and station) is loaded once.

## 7c. Undoing history

Undo of an invoice-history or register import **voids** what it loaded: the
rows stop counting everywhere at once and are **kept** (nothing is deleted).
**Reopen** the import and load it again to restore exactly the same rows —
never a second copy.

## 8. File rules

- **CSV** (comma, semicolon, tab or pipe — worked out from the first line;
  UTF-8 or Windows-1252) or **Excel .xlsx** (first sheet).
- Column names in the **first row**. Blank rows are skipped but keep their
  numbers, so "row 5,212" in a report is row 5,212 in Excel.
- Refused: **macro workbooks (.xlsm)**, old **.xls** files (save as .xlsx or
  CSV), files over 1,000,000 rows (split them). The type is checked from the
  file's content, not its name.
- Excel dates come through as dates (2024-03-15); numbers Excel stored with
  rounding noise come through as people read them; formulas give their last
  saved value and are never run.
- Every downloaded file (rejects, possible duplicates, report, templates)
  neutralises spreadsheet formulas, so nothing typed into the system can run
  as a formula when opened in Excel.

## 9. Size, speed and the database

The staging area lives in the organisation's own Postgres database (no new
services). Every figure below was **measured**, not estimated.

### The 800,000-material speed run (A2)

A full SAP material master — 800,000 materials, 69 MB of CSV with the SAP
field names (MATNR, MAKTX, MATKL, MEINS, XCHPF, EAN11, VKP, MINBE, EISBE,
MEINH, UMREZ) — taken through the real screens in a browser: upload, column
matching, check, a second person's approval, load, then a catalogue search.
Run with `e2e/perf-parts.spec.ts` (`PERF_FILE=…`; not part of CI) on
31 October 2026, against Postgres 16 on a 2-processor, 8 GB machine with the
browser on the same machine.

| Step | Time | Rate |
| --- | --- | --- |
| Upload (read in the browser, sent in blocks) | 1 min 56 s | ≈ 6,900 rows a second |
| Check (nothing live changes) | 1 min 6 s | ≈ 12,000 rows a second |
| Load, after approval | 5 min 48 s | ≈ 2,300 rows a second |
| **Total, file to catalogue** | **≈ 9 minutes** | |
| Parts Catalog search ("Brake pad") among 800,000 parts | 3 s, page included | paged, 50 a page |

All 800,000 materials were created: none rejected, none duplicated, and
`created = rows − rejected − duplicates` was asserted at the end. The
**Opening stock** and **Suppliers** files use the same engine; their size is
far smaller (one line per part held, one per vendor).

**Database space** after the run: the 800,000 parts take **475 MB** (with
their indexes); the staged rows of that import take **513 MB**. Plan for
about **1.3 KB per material** in total while the import is kept. The free
development tier of Supabase (500 MB) is therefore too small for a full
material master; the demo keeps **50,000** parts (`docs/demo/03_SAP_parts_50k.csv`),
which fits comfortably. On the organisation's paid plan this is routine.

### What keeps it fast at any size

- **Steady, few requests.** Each check, load or undo request works in blocks
  for about 2.5 seconds, then answers with its progress: about 25 requests a
  minute whatever the server's speed — well inside the portal's flood limit
  of 120 submissions a minute per person (`middleware.ts`). Uploads send at
  most one block every 0.6 s. (The first speed run found this limit: a check
  quicker than two requests a second was being refused. A test now pins the
  pacing to the limit.)
- **A row cursor.** Each block reads on from the last row number through the
  (import, row number) index, so block 800 is as quick as block 1.
- **Interruptions are harmless.** A request that fails or does not answer
  within two minutes is tried again (five times, about a minute in all, with
  "reconnecting…" on the bar), then the page offers *Carry on*. Every step is
  repeatable: a row is never checked or loaded twice. Closing the page and
  opening it again carries on where it was.
- **Lookups by index only.** Matching against existing parts, customers and
  vehicles uses the indexed number as written and in capitals — never a scan
  that changes every row's case.
- **The Store's screens are paged.** Parts Catalog (50 a page, searched on
  the server), the goods-receipt part picker (25 matches as you type) and the
  low-stock list (bounded) do not grow with the catalogue.

## 9a. Staged files: space and release

Each import keeps a copy of its file — every row — while it is checked,
approved and loaded (about 0.6 KB a row for a material master; the
800,000-row run took 513 MB). Once it is no longer needed it is
**released**:

- **When:** a set number of days after the import **finished** — counted
  from Finance's confirmation for opening stock and invoice history, never
  before it. **30 days** by default; an administrator changes it on the
  Data Exchange page (*Release a finished import’s file after … days*; 0 keeps
  every file for ever). The daily run at 8:00 releases what is due and is
  listed on the scheduled-jobs page (*Imported files released*).
- **Early:** an approver of that kind of record presses **Release it now** on
  the import.
- **What is kept:** the import's summary and counts; **every row's outcome**
  (status, the record it made, its notes) — so *Every row and its outcome*
  still downloads; the **rejected and duplicate rows** whole (the *to fix in
  Excel* file still downloads); **possible duplicates** whole (to follow up);
  and rows whose filled-in fields an **undo** would empty again. Undo keeps
  working after a release.
- **What goes:** the cells of every other row. A released import cannot be
  **reopened** — start a new import with the same file instead (it is
  recognised, and nothing is added twice).
- **Space:** the Data Exchange page shows the space all staged files take
  now and each import's own (*Staged file*); the import page shows its size,
  when it will be released, and who released it. Every release is in the
  audit trail with the space before and after.

Cancelling an import removes its staged file at once (nothing was loaded
from it).

## 10. For the database administrator

| Change | Script |
| --- | --- |
| A0 — customer email optional; SAP numbers on customers, vehicles, parts | `scripts/predeploy/0003-external-keys.sql` (deploy) · `scripts/v-a0-optional-email-sap-keys.sql` (manual, Supabase SQL editor) |
| A1 — import tables; "made by this import" on customers and vehicles | `scripts/predeploy/0004-data-exchange.sql` (deploy) · `scripts/v-a1-data-exchange.sql` (manual) |
| A2 — suppliers; opening-balance receipts; parts made by an import; Finance sign-off | `scripts/predeploy/0005-parts-stock-suppliers.sql` (deploy) · `scripts/v-a2-parts-stock-suppliers.sql` (manual) |
| A3 — customer since; invoice history; production / QC / PDI registers | `scripts/predeploy/0006-sap-history.sql` (deploy) · `scripts/v-a3-sap-history.sql` (manual) |
| Staged files — release period, size, release record | `scripts/predeploy/0007-import-staging-release.sql` (deploy) · `scripts/v-a4a-import-staging-release.sql` (manual) |

All are additive (new tables, columns and indexes), re-runnable, and tested
twice on Postgres 16 against the previous structure and compared with a
fresh schema. Run them in order (A0, A1, A2, A3, then the staged-files script).

## 11. Open questions for the organisation (not guessed in code)

1. Which SAP extracts will be supplied (customer master, material master,
   stock), from which SAP release, and with which field names.
2. Company codes, plants (WERKS) and storage locations for the automobile
   division — needed for the parts and stock imports (A2).
3. Volumes: customers, vehicles, part lines, and how many years of service
   history to bring in.
4. Who signs off the migration totals (Store, Finance, Workshop) and the
   cut-over date for open jobs.
