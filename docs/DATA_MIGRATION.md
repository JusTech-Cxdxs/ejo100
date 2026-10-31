# Data migration — bringing existing records into EJO 100

How an organisation's existing data (years of customers, vehicles and, from
phase A2, parts and opening stock) comes into EJO 100 from SAP and from
spreadsheets, **without retyping and without risk to the live records**.

> Status: **A1** (this document's first version). Customers and vehicles.
> Coming next: A2 parts master (800,000 lines), opening stock, suppliers;
> A3 open job cards, service history, warranties, price lists; A4 export from
> every list and the measured performance run.

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
| 6. Report and undo | The report adds up: rows in the file = added + filled in + not added + rejected. The full row-by-row outcome downloads as a file. **Undo** removes exactly what the import added, and empties only the fields it filled in — refused while any work has been recorded on those records since. | Undo reverses it |

Every step is in the audit trail (*Data exchange …* entries) with who, when
and the counts. The staged copy of the file is kept with its import; it is
deleted at once if the import is cancelled.

## 2. Who does what

| Role | Prepare (upload, match, check, send for approval) | Approve, load, send back, undo |
| --- | --- | --- |
| Administrator (headquarters) | Yes | Yes (never their own) |
| Group IT administrator | Yes | — (the business approves what goes in) |
| Branch administrator | Yes | — |
| Workshop manager | — | Yes |
| Customer care lead | — | Yes |
| Everyone else (front desk, technicians, finance, store, security…) | — | — |

Approving also needs the right to manage customers, so only the people who
own customer records approve them.

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

## 5. File rules

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

## 6. Size and the database

The staging area lives in the organisation's own Postgres database (no new
services). A row of a typical customers file takes roughly 0.5–1 KB staged.
For the largest loads (the 800,000-line parts master in A2) the organisation's
database plan must allow for the staged rows plus the records themselves; the
free development tier (500 MB) does not. The A4 performance run will record
measured timings and sizes here.

## 7. For the database administrator

| Change | Script |
| --- | --- |
| A0 — customer email optional; SAP numbers on customers, vehicles, parts | `scripts/predeploy/0003-external-keys.sql` (deploy) · `scripts/v-a0-optional-email-sap-keys.sql` (manual, Supabase SQL editor) |
| A1 — import tables; "made by this import" on customers and vehicles | `scripts/predeploy/0004-data-exchange.sql` (deploy) · `scripts/v-a1-data-exchange.sql` (manual) |

All are additive (new tables, columns and indexes), re-runnable, and tested
twice on Postgres 16 against the previous structure. Run A0 before A1.

## 8. Open questions for the organisation (not guessed in code)

1. Which SAP extracts will be supplied (customer master, material master,
   stock), from which SAP release, and with which field names.
2. Company codes, plants (WERKS) and storage locations for the automobile
   division — needed for the parts and stock imports (A2).
3. Volumes: customers, vehicles, part lines, and how many years of service
   history to bring in.
4. Who signs off the migration totals (Store, Finance, Workshop) and the
   cut-over date for open jobs.
