# EJO 100 and SAP

How EJO 100 lines up with SAP ECC / S/4HANA, record by record, so that data
moves between the two without retyping or reshaping. EJO keeps the numbers
SAP knows each record by, in SAP's own terms, beside its own number.

This document grows with each release. **Today** EJO reads SAP extracts
(Data Exchange imports) and keeps every SAP number it is given. Since C1a it
writes the daily files SAP posts from (section 3a) and reconciles them line by
line with SAP's return file; C1b takes SAP's refreshes back in.

## 1. Who owns what

| Area | System of record | EJO's part |
| --- | --- | --- |
| Customer master (business partners) | SAP | Imports them (KUNNR kept), adds contacts, portal access, CRM history; new walk-in customers are created in EJO and sent to SAP *(C1)* |
| Vehicles / equipment | SAP equipment (EQUI) where kept; EJO for workshop and plant history | One page per VIN from kit to latest visit; EQUNR kept |
| Material master (parts) | SAP | Imported (MATNR kept); prices and reorder levels may be refined in EJO |
| Suppliers (vendors) | SAP | Imported (LIFNR kept) |
| Stock (quantities and value) | SAP for the books; EJO for the workshop floor | Opening stock imported (LABST, LGORT); goods movements posted back *(C1)* |
| Workshop jobs, inspections, estimates | **EJO** | Billing and goods issues posted to SAP *(C1)* |
| Plant: build, QA, PDI, yard | **EJO** (on screen since D1) | Production order (AUFNR), equipment (EQUNR) and the PDI usage decision posted *(C1)* |
| Invoices and accounting | SAP | History imported (VBELN / BELNR, BUKRS, GJAHR kept) for spend and analytics |

## 2. Record by record

### Branches and plants — SAP plant (WERKS)

Every EJO branch is one kind of place (workshop, assembly plant, sales, head
office, warehouse). An **assembly plant** is a branch of kind *Assembly plant*
with its SAP plant code: Kewalram's Afprint Assembly Plant is SAP plant
**1100** in the demo data (set the real code on the branch). Every vehicle
built there, every kit received and every usage decision carries that WERKS.
The workshop (Isolo Branch) may carry its own plant code where it is a stock
point in SAP (its store's LGORT lives under it).

| EJO | SAP | Notes |
| --- | --- | --- |
| Branch of kind Assembly plant | WERKS (a manufacturing plant) | One EJO branch per SAP plant; the kind decides which records may live there |
| Branch of kind Workshop / Warehouse | WERKS (a stock point) + LGORT | Parts, opening stock and invoice history load only into these |
| Plant departments | Work centres (ARBPL), loosely | Kit receiving, the line, quality, PDI, yard; EJO's stations (D3) map to work centres |

### Staff — SAP HR (PA0001, PA0002, PA0105)

The staff file reads the personnel number (PERNR, kept and searchable), the
name (ENAME), the work email (communication type 0010 in PA0105,
USRID_LONG), the plant or personnel area as the branch (WERKS/BTRTL) and the
organisational unit as the department (ORGEH, matched to EJO's department
name). EJO roles are given by name in the file; SAP authorisations are not
read (P7, DATA_MIGRATION.md §2b). Accounts come in switched off until the
invitations are sent.

### Customers — SAP business partner / customer master (KNA1, BUT000)

| EJO field | SAP field | Notes |
| --- | --- | --- |
| SAP / old-system number | KUNNR (or PARTNER) | Leading zeros understood either way; searchable ("SAP customer 1000123") |
| Name | NAME1 (+ NAME2) | |
| Phone, second phone | TELF1, TELF2 | |
| Email | SMTP_ADDR | Optional: customers without one are reached by phone |
| Address | STRAS, ORT01, REGIO | |
| Customer since | ERDAT | Used for "customer since" and analytics, not the import date |

### Vehicles — SAP equipment (EQUI) / vehicle (VLCVEHICLE)

| EJO field | SAP field | Notes |
| --- | --- | --- |
| Chassis number (VIN) | VHVIN / SERGE | The vehicle's single page is `/vehicles/VIN`; its label carries a QR code and a Code 128 barcode of the VIN |
| Vehicle number | EQUNR | |
| Owner | KUNNR | |

### Parts — SAP material master (MARA, MARC, MBEW)

| EJO field | SAP field | Notes |
| --- | --- | --- |
| Part number | MATNR | |
| Description | MAKTX | |
| Base unit | MEINS | ST, EA, PC, L, KG… |
| Material group / category | MATKL | |
| Opening stock | LABST (per WERKS / LGORT) | Loaded as an opening-balance goods receipt with its value |

### Suppliers — SAP vendor master (LFA1)

| EJO field | SAP field |
| --- | --- |
| Supplier number | LIFNR |
| Name, phone, email, address, tax ID | NAME1, TELF1, SMTP_ADDR, STRAS / ORT01, STCD1 |

### Job card history — SAP service orders (AUFK / AFIH, IW39 list) and notifications (QMIH)

The workshop's job cards before EJO: one service order per visit, its
6-digit number the job number. Read-only history in EJO (P4).

| EJO field | SAP field | Notes |
| --- | --- | --- |
| Job number | AUFNR | Leading zeros come off (000000482913 → 482913) |
| Order type | AUART | SM01 counts as a service inside EJO |
| Notification | QMNUM (QMART) | |
| Customer | KUNUM / KUNNR / KUNAG | Or found through the vehicle's owner |
| Vehicle | VHVIN / LICENSE_NUM / EQUNR | VIN, plate or equipment |
| Opened on / completed on | ERDAT (GSTRP) / IDAT2 (GLTRP) | |
| Mileage | RECDV (measurement document) | km; anchors the next-service clock |
| Complaint, work done | KTEXT / QMTXT, LTXA1 | "Carry out service" marks it a service |
| Technician, work centre | PERNR, ARBPL | Staff only |
| Amounts, invoice | NETWR, VBELN | Matched to the invoice history by VBELN: one visit, never twice |
| Status | ISTAT / STAT: TECO, CLSD → Closed; CNCL, DLFL → Cancelled | REL / CRTD (open) is refused here |
| Branch | WERKS (IWERK) | Must be the import's branch |

Export **SAP job card history** writes these names back as column headers.

### Open job cards at the cut-over — SAP service orders still open (IW38)

The same order list as the history, filtered to orders not yet closed, loads
as **live EJO job cards** (P5): AUFNR kept as the old number, ERDAT the
opening day, the system/user status mapped to EJO's stage (CRTD → checked
in, REL → in progress, TECO → completed; see DATA_MIGRATION.md §7a3), the
order's costs as the approved estimate, issued components (RESB/MSEG) as
*issued before EJO* lines without moving stock, down payments as opening
payments Finance confirms. Closed orders (CLSD/TECO with billing done and the
vehicle collected) go to the history import instead.

### Open services and the diary — service orders and appointments

Open routine services (the same IW38 list, PM activity type for services)
and the workshop's appointment diary — whether SAP (the order's basic start
date and time, GSTRP/GSUZP) or a spreadsheet — load as EJO Vehicle Services
(P6b, DATA_MIGRATION.md §7a3b): a booking waits for its customer on its day
and time, a service in the workshop carries on at its stage. AUFNR, QMNUM or
the diary's reference is kept as the old number.

### Warranties and open claims — SAP warranty (WTY) or PM/QM

The **warranties** file reads the master warranty (MGANR) or the warranty
counter as the old number, the equipment or VIN (EQUNR/VHVIN), the customer
(KUNNR), the warranty start and end (GWLDT, GWLEN), the material and serial
for a part (MATNR, SERNR) and the billing document as evidence (VBELN);
EJO's own policy is named by its code, or found from the months, km and
provider (P6, DATA_MIGRATION.md §7a4). The **open claims** file reads the
claim number (CLMNO, or the notification QMNUM), the repair date (REPDA),
the three Cs, the claimed amounts and the provider's reference (REFNO);
settled claims stay in SAP. EJO writes nothing back to SAP.

### Invoice history — SAP billing (VBRK) / accounting (BKPF, BSID)

| EJO field | SAP field | Notes |
| --- | --- | --- |
| Invoice number | VBELN or BELNR | SAP reuses numbers per company code and fiscal year: EJO keeps all three |
| Company code | BUKRS | |
| Fiscal year | GJAHR | Search "125262 2026" narrows to one year |
| Customer | KUNAG / KUNRG / KUNNR | |
| Amount | NETWR / DMBTR | |

### Assembly plant (D1) — production order, equipment and quality inspection

Every vehicle in the plant is one record per VIN, carrying:

| EJO field | SAP field | Notes |
| --- | --- | --- |
| Plant | WERKS | Set on the branch (Branch → SAP plant code); copied to each vehicle |
| Material (the vehicle model) | MATNR | e.g. the NQR 75 cab-chassis material |
| Production order | AUFNR | |
| Equipment | EQUNR | Created in SAP at goods receipt from production, or by EJO's file *(C1)* |
| Model | (EJO) NQR, NPR, QLR, QMR, S07 | Chooses the PDI checklist |

A **pre-delivery inspection** is EJO's record of the quality check SAP QM keeps
as an inspection lot:

| EJO | SAP QM | Notes |
| --- | --- | --- |
| PDI number (PDI-2026-000012) | Inspection lot (PRUEFLOS) reference | |
| Each checklist item: OK / Not OK / N/A | Characteristic results | Item codes are stable (e.g. EN01 engine oil level) |
| Fault codes found and cleared | Defects (QMFE) | |
| Accepted by a second person | Usage decision **A** | Never the inspector |
| Rejected back to rework | Usage decision **R** | With the reason and the items to put right |

### Kits arriving (D2) — goods receipt and incoming inspection

A **shipment** is one bill of lading; each **kit** in it is one vehicle (CKD
or SKD), named on the supplier's packing list. In SAP the kits are received
against a purchase order (MIGO, movement **101**), and the receipt opens a
QM inspection lot (origin 01, goods receipt). EJO is where the receiving
bay records that inspection as it happens.

| EJO | SAP | Notes |
| --- | --- | --- |
| Shipment (SHP-2026-000001) | Inbound delivery (VBELN), purchase order (EBELN) | Both typed on the shipment; the bill of lading, vessel and containers are kept with it |
| Kit (KIT-2026-000001) | Inspection lot (PRUEFLOS); material document of the goods receipt (MBLNR) | Typed on the kit once SAP has them; until then the kit number is EJO's reference |
| VIN / frame number, engine number, lot | Serial / batch on the receipt; later the vehicle's equipment (EQUI) | One kit per VIN: a VIN cannot be a kit twice, nor a kit once it is a vehicle |
| Arrival checks: OK / Not OK / N/A | Characteristic results | Versioned checklists per model family; codes are stable (CS02 case count, FR01 frame rails…) |
| Shortage, damage, wrong part, excess | Defects (QMFE) / quality notification for the supplier (Q2) | Part number, case and quantity; *stops the line* or not; the claim's reference and the resolution |
| Released to the line by a second person | Usage decision **A** (stock to unrestricted) | Never the inspector or anyone who checked it. *With shortages* needs a written concession |
| On hold | No usage decision yet (stock stays in quality inspection) | Put right, then sent again |
| Rejected | Usage decision **R** | The kit is not built: back to the supplier or an insurance claim |

Releasing a kit creates the vehicle in the plant at stage *On the line*
(or moves on a vehicle already registered). A PDI cannot start on a VIN whose
kit is still at arrival, on hold or rejected.

Exports: **Kits arriving at the plant** (every kit with the SAP numbers above)
and **Kit shortages and damage**, the list a supplier claim is built from.

### The line (D3) — routings, confirmations and QM defects

A **route** is EJO's routing for a model family: its stations in order, the
standard minutes and the checks at each. A **station visit** is one vehicle at
one station; a **defect** is one QM defect; a **QA audit** is a product audit
of a finished vehicle.

| EJO | SAP | Notes |
| --- | --- | --- |
| Route (family, version) | Routing (PLKO / PLPO), one operation per station | Versions are kept; a vehicle keeps the version it started with |
| Station code (C1, C2, G1) | Work centre (ARBPL) / operation number (VORNR) | Stable codes per family; plant WERKS from the branch |
| Standard minutes | Standard value (VGW01) | Median actual minutes are shown beside it on the board |
| Station passed (operator, started, finished) | Order confirmation (CO11N: AFRU — ISMNW actual time, ISDD/ISDZ) | Per vehicle and operation; the gate's pass is a separate confirmation by quality |
| Check result (pass/fail or measured value with limits) | Inspection characteristic result (QAMR), with the characteristic's limits | Codes are stable (C1-03 cross-member bolt torque, N·m 180–220) |
| Defect: location · type · cause, severity A/B/C | QM defect (QMFE): defect location, defect type (code group), cause (QMUR) | Catalogue codes in `lib/plant/line.ts`; severity A stops the vehicle, B before the gate, C cosmetic |
| Reworked by the line, verified by quality | Task / defect status (QMSM); verification by a second person | Never the person who reworked it |
| Gate passed | Final operation confirmation + usage decision **A** on the order's inspection lot | Needs every station passed, no open A/B, every gate check passed; never the recorder |
| QA audit (QAA-…), demerits, PASS/FAIL | Product audit (QAUDIT / audit management), demerit score | A finding or 20 demerits fails; a failed audit reverses the gate and raises the findings as defects |

Exports: **Line stations**, **Line defects** and **QA audits**, each with the
SAP names above as column headers.

### Where a plant record came from

Vehicles, shipments and kits carry `externalSource` and `externalId`: null
for a record made in EJO, the import's name and the record's number there
for an imported one, and `EJO-DEMO` for the demo. SAP reconciliation and the
plant records import key on them; nothing else in SAP changes.

### The plant's records at the cut-over (P8)

Four imports bring in what is at the plant on the day it starts using EJO
([DATA_MIGRATION.md §7b2](DATA_MIGRATION.md)), each recognising SAP's
field names as column headers:

| File | SAP names it reads | Kept as |
| --- | --- | --- |
| Plant shipments | EBELN (purchase order), VBELN (inbound delivery), LIFNR / NAME1 (supplier), WERKS | `externalId` = the shipment's reference; EJO gives its own SHP number |
| Plant vehicles | VHVIN (VIN), MATNR (material), AUFNR (production order), EQUNR (equipment), MAKTX, WERKS | `externalId` = the VIN |
| Plant kits | PRUEFLOS (inspection lot), MBLNR (goods receipt), VCODE (usage decision A / R), WERKS | `externalId` = the VIN; EJO gives its own KIT number |
| Plant kit issues | MATNR (part) | on its kit |

`importJobId` on each record names the import that brought it in (undo
moves only that import's records). Usage decisions taken in SAP before the
cut-over are kept as they were (A for released, R for rejected; none for a
kit on hold).

## 3. The daily files

### 3a. Postings for SAP (C1a — in)

**Data Exchange → Postings for SAP**. From the day a branch is signed off as
cut over (the cut-over checklist), what happens there in EJO goes to SAP as
files in SAP's own field names, which SAP's team loads with their own tools
(Migration Cockpit, LSMW, BAPI programs) under their own checks. EJO never
writes into SAP.

| File | Each line | SAP fields |
| --- | --- | --- |
| New customers (the organisation's) | A customer created in EJO with no SAP number | ZZ_EJO_LINE, ZZ_EJO_ID, KUNNR (empty), NAME1, TELF1, SMTP_ADDR, STRAS, ERDAT |
| Goods receipts | A part received into the Store (not an opening balance) | BWART 101, BLDAT, BUDAT, WERKS, MATNR, MENGE, MEINS, CHARG, LIFNR, XBLNR, DMBTR, WAERS |
| Goods issues | A part released to a job card or service | BWART 261 (to its SAP order, AUFNR) or 201 (none), BUDAT, WERKS, MATNR, MENGE, MEINS, ZZ_EJO_REF |
| Workshop billing | A job card or service closed | FKDAT, WERKS, KUNNR, ZZ_EJO_REF, NETWR (the customer's), ZZ_WARRANTY, ZZ_GOODWILL, ZZ_INTERNAL, WAERK |
| Payments | A payment recorded | BUDAT, WERKS, KUNNR, WRBTR, WAERS, ZLSCH (C cash, T transfer), XBLNR |
| Refunds (C1b) | Money paid back against a job card or service | BUDAT, WERKS, KUNNR, WRBTR, WAERS, ZLSCH, XBLNR (the refund's number), ZZ_EJO_REF (the job), SGTXT (the reason) |
| PDI usage decisions (C1b, the plant) | A PDI decided: A when it passed, R each time it was rejected back to rework | VDATUM, WERKS, MATNR, SERNR (the VIN), EQUNR, AUFNR, VCODE (A or R), ZZ_EJO_REF (the PDI's number) |
| Vehicles to the yard (C1b, the plant) | A vehicle that passed PDI, received from its production order — once per vehicle | BWART 101, BUDAT, WERKS, MATNR, MENGE 1, MEINS EA, AUFNR, SERNR, EQUNR, ZZ_EJO_REF |

- **What goes in:** everything since the sign-off not yet in a file, up to
  the day chosen (yesterday by default; catching up is the same button). Never
  history brought in by an import, an opening balance, or the demo. At most
  20,000 lines a file; the rest go in the next.
- **One file at a time:** made under a lock per organisation, so a posting is
  never in two files. Each file has a number (SAP-2026-000001), its control
  totals (lines, quantity, amount) and a **SHA-256 checksum**. The CSV is
  rebuilt from its lines on every download — the same bytes every time — and
  is not given out if it no longer matches (the header *X-Checksum-SHA256*
  carries it too). Line 1 is the header; days are YYYYMMDD in Lagos; KUNNR and
  LIFNR carry SAP's leading zeros; amounts and quantities use a point.
- **A status per line.** SAP's return file (CSV or Excel) names each line by
  **ZZ_EJO_LINE**, with **STATUS** (S posted, W posted with a note, E or A
  rejected), the document number (BELNR, MBLNR, VBELN; KUNNR for a new
  customer) and **MESSAGE**. Each line is set once; the same answer twice
  changes nothing; a different answer for a line already answered is reported,
  never applied. A new customer posted with its KUNNR gets that SAP number in
  EJO when it has none and no other customer has it (audited on the customer).
- **Rejected, then fixed:** fix it in EJO or in SAP, then **Send again** on
  the line: it goes in the next file of its kind, the new line naming the old
  (which shows *Sent again*).
- **Reconciliation:** each branch shows, per kind, since its sign-off: *not
  in a file yet*, *sent and waiting for SAP*, *posted* and *rejected* — counts
  and amounts. Every event is in exactly one of these.
- Every file made, downloaded and answered, and every posting sent again, is
  in the audit trail.
- **Which branch sends what:** a workshop its goods receipts and issues,
  billing, payments and refunds; a warehouse its goods receipts and issues;
  the assembly plant its PDI usage decisions and vehicles to the yard; the
  organisation its new customers. A sales branch sends nothing yet: vehicle
  sales are not recorded in EJO, so there is nothing true to send.
- **The plant (C1b).** An accepted PDI is final, so its A is read from the
  inspection. A rejection is overwritten when the PDI is decided again, so
  each R is read from its audit entry, which is written in the same
  transaction as the decision and so can never be missing. AUFNR carries
  SAP's zeros to 12 digits and EQUNR to 18. A vehicle is received into the
  yard once, whatever happens after.
- **"Sent to SAP" on the record's page (C1b).** A job card, a service, a PDI
  and a customer show each of their postings — the job's billing, its
  payments, refunds and parts issued; the PDI's decisions and its vehicle's
  yard receipt — with the file it went in and SAP's answer (document number
  or message). Only the people who make or confirm the branch's postings see
  it.

### 3a2. SAP's master data back in (C1b)

SAP's own extract of customers, vehicles (equipment), suppliers or parts —
with no "EJO record" column — loads with **Update … exported from EJO, or
from SAP's own file** and source **SAP**. Each row is found by its SAP number
only (KUNNR, EQUNR, LIFNR, MATNR; SAP's leading zeros make no difference; a
part within the import's branch, by its SAP number or, kept as SAP's MATNR,
its part number). A number on no record, or on more than one, is refused in
plain words — never guessed. Everything else is the round trip of P10
(DATA_MIGRATION.md): every change previewed as "from → to", an empty cell
leaves a field as it is, approval by someone else, a field changed in EJO
since the check left as it is, each change in the record's history, and undo.

### 3b. What C1 covers overall

- **Outbound files** EJO writes for SAP each day, in SAP's own field names: new
  customers, goods issues for jobs, workshop billing, plant events (PDI usage
  decisions, vehicles to the yard, sales).
- **Inbound refreshes** from SAP: the master data changed since the last file.
- **Every sync situation** handled and listed: a record changed on both sides,
  deleted in SAP, a number SAP rejected, a posting failed and fixed.
- **Reconciliation**: counts and values on both sides, every difference
  explained, and the "Where this came from" box showing the SAP postings that
  included each record.
