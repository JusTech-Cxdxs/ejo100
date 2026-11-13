# Using EJO 100 on the assembly line and in QA

For the plant manager, supervisors and inspectors. It follows one vehicle from the day its kit
arrives to the day it stands in the yard: who does each step, on which screen, and what is printed
or sent to SAP. Everything described is in the system today. What is not built is listed in [section 8](#8-what-it-does-not-do-yet).

**State of the data.** The plant screens have so far been run with invented demo records only. No
real plant record has been entered. The SAP plant code in the demo, 1100, is a placeholder: set the
real code on the branch before use.

## 1. The idea

- The plant is its own **branch** in EJO, of the kind *Assembly plant*, with its SAP plant code.
  Plant staff see the plant and nothing of the workshop; workshop staff do not see the plant.
- Every vehicle is one record, known by its **VIN**. It moves through six stages: *Kit arrival* →
  *On the line* → *Quality audit* → *Pre-delivery inspection* → *In the yard* → *Sold*.
- Every decision that lets a vehicle move on is taken by a **second person**, never the one who did
  the checking. This applies to the plant manager too.
- Nothing is deleted: a mistake is cancelled with a reason and kept. Every step is in the audit trail.
- SAP stays the system of record for stock, production orders and accounting. EJO records what
  happens on the floor and hands SAP a file.
- Models known today: Isuzu **NQR, NPR, QLR, QMR** (one family, CKD kits) and Soueast **S07** (SKD).

## 2. Where things are in the menu

| Screen | How to get there | What it is for |
|---|---|---|
| Assembly plant | Menu → Assembly plant | Counts by stage, kits waiting, the PDI queue; start a PDI |
| Record a shipment | Assembly plant → Record a shipment | A new bill of lading and its kits |
| Shipments of kits | Assembly plant → Shipments | Every shipment, with its kits and open issues |
| Kits | Assembly plant → Kits | Every kit; filter by status; export shortages |
| The line | Assembly plant → The line | The board: every vehicle at its station, and the figures |
| Build (one vehicle) | The line → tap a vehicle | Record checks, raise and rework defects, the gate |
| Routes | The line → Routes | The stations and checks for each model family |
| QA audits | The line → QA audits | Pick the day's sample and score it |
| PDI (one inspection) | Assembly plant → scan or type the VIN → Start the PDI | Checklist, readings, approval |
| Vehicles in the plant | Assembly plant → Vehicles in the plant | Every vehicle by stage, with its SAP numbers |
| The vehicle's page | Search the VIN, or scan its label | The vehicle's whole history on one page |
| Approvals → Plant | Menu → Approvals | What is waiting for you to decide |
| Postings for SAP | Data Exchange → Postings for SAP | The daily files for SAP |

## 3. Who does what

Roles are given to people under **Users** and are scoped to the plant branch.

| Role | Does | Cannot |
|---|---|---|
| Kit Inspector | Records shipments, checks kits, raises shortages and damage | Release a kit |
| Quality Supervisor | Releases, holds or rejects kits; verifies rework; passes the gate; audits; edits routes | Release a kit they checked |
| Line Operator | Records each station's checks; raises defects; records rework | Verify own rework; pass the gate; edit routes |
| Production Supervisor | Works the line; edits routes; prints labels; exports | Pass the gate; audit |
| QC Inspector | Works the line; verifies reworked defects; passes the final gate | Pass a gate whose checks they recorded |
| QA Auditor | Audits finished vehicles and scores them | Work the line |
| PDI Inspector | Registers a vehicle; carries out the PDI | Approve a PDI |
| PDI Supervisor | Carries out and approves PDIs | Approve a PDI they inspected |
| Plant Manager | Everything above; approves the plant's imports | Decide on anything they checked themselves |

## 4. One vehicle, step by step

### Step 1. The shipment arrives (Kit Inspector; *Record a shipment*)

1. Enter the supplier, bill of lading, vessel, containers, arrival date, and the SAP purchase order
   and inbound delivery numbers if you have them.
2. Paste the kits from the supplier's packing list, one line per vehicle: VIN, engine number, model,
   lot, number of cases. Rows copied straight from Excel work.
3. The form lists every bad line first: something that is not a VIN, the same VIN twice, a model the
   plant does not build, a VIN already in the plant. Press **Record the shipment**. If one line is
   wrong, nothing is saved. The shipment gets a number (SHP-2026-000001) and each kit its own
   (KIT-…). A shipment holds at most 200 kits.

### Step 2. Kit quality control (Kit Inspector, then Quality Supervisor or Plant Manager; *Kits*)

1. Open the kit. Answer each arrival check **OK**, **Not OK** (say what is wrong) or, where offered,
   **N/A**. The checks cover cases and seals, identity, frame and cab (or body), major units, parts.
2. Enter how many cases arrived.
3. Under *Shortages and damage*, raise each problem (shortage, damaged, wrong part, excess) with the
   part number, case and quantity. Tick **It stops the line** if the vehicle cannot be built without it.
4. Press **Send for release**. The kit is *Waiting for release*.
5. The supervisor opens it from **Approvals → Plant** and chooses one of:
   - **Release to the line (A)**. Refused while an issue that stops the line is open. With other
     issues still open, a written reason is required: **Release with shortages (A)**.
   - **Hold**. The kit stays in quarantine; the inspector puts it right and sends it again.
   - **Reject (R)**. Final. That VIN is not built.
6. Each issue is followed on the kit: **Claimed** (with the supplier claim reference), then **Resolved**.

Releasing a kit creates the vehicle at the stage *On the line*, with its route's stations. Kit statuses:
*Arrived*, *Being inspected*, *Waiting for release*, *On hold*, *Released to the line*, *Rejected*, *Cancelled*.

### Step 3. The line, station by station (Line Operator, Production Supervisor; *The line*)

The board shows one column per station and every vehicle in its column, with the minutes it has been
there and its open defects. Above it: vehicles on the line, in rework, passed the gate today,
first-time-through and defects per unit over 30 days, and open A-defects. Each column shows the
median time at that station beside its standard time and marks a slow one.

| Isuzu truck route | Kind | Soueast S07 route | Kind |
|---|---|---|---|
| C1 Chassis on the line | Station | B1 Body receiving | Station |
| C2 Cab fitted | Station | T1 Trim and glazing | Station |
| C3 Fluids, battery and first start | Station | M1 Chassis and powertrain marriage | Station |
| E1 End-of-line tests | Test | F1 Wheels and fluids | Station |
| R1 Road test | Test | E1 End-of-line tests, W1 Water test, R1 Road test | Test |
| G1 Final inspection | Quality gate | G1 Final inspection | Quality gate |

These are the built-in routes. The Production Supervisor, Quality Supervisor or Plant Manager edits
stations, checks, limits and standard minutes under **Routes**. Each save is a new version; vehicles
already on the line keep the stations they started with.

1. Tap the vehicle on the board. Stations run in order: a later one is refused until the earlier
   ones are finished.
2. Record each check. A check is **Pass / Fail**, or a **measurement** with limits (a wheel-nut
   torque in N·m, for example). A measurement outside its limits fails by itself.
3. Press **Finish the station**. Refused until every check is recorded and every failed check has a
   defect raised.

### Step 4. Defects and rework (operator raises and reworks; QC Inspector or Quality Supervisor verifies)

1. Raise the defect from the catalogue: **where** (frame, axles, cab, electrical…), **what** (missing
   part, loose, leak, scratch…) and **why** (operator, tool, part, kit shortage…). It gets a DEF number.
2. Give it a severity. **A**: safety or function, stops the vehicle. **B**: must be fixed before the
   gate. **C**: cosmetic, does not stop the gate.
3. The station shows *Failed, in rework*. When the work is done, say what was done and press **Reworked**.
4. A second person opens it from **Approvals → Plant** and presses **Verified: close**, or **Still
   wrong** with a note, which reopens it. The person who reworked it cannot verify it.
5. The operator records the failed check again and finishes the station.

### Step 5. The final gate (operator records its checks; quality passes it)

1. At G1 the operator records the gate's checks and presses **Finish the gate checks**.
2. A QC Inspector, Quality Supervisor or Plant Manager presses **Pass the gate: ready for PDI**. It
   is refused if a station is unfinished, an A- or B-defect is open, a gate check failed, or the
   person pressing recorded the gate's checks. The vehicle then moves to the stage *Quality audit*
   and is listed as ready for PDI.

### Step 6. QA audit (QA Auditor, Quality Supervisor or Plant Manager; *QA audits*)

1. The audit is a sample, not every vehicle; the plant decides how many a day. Pick a vehicle from
   *Passed the gate, not yet audited* and press **QA audit this vehicle**. It gets a QAA number.
2. Walk the vehicle by section (exterior, interior, engine bay, under-body, electrical, documents)
   and record each finding with its severity.
3. Finish the audit. An A finding scores 10 demerits, a B 5, a C 1. **An A finding, or 20 demerits
   or more, fails the audit.**
4. A failed audit sends the vehicle back to the line: each finding becomes a defect to rework and
   verify, and the gate must be passed again.

### Step 7. Pre-delivery inspection (PDI Inspector, then PDI Supervisor or Plant Manager)

1. On **Assembly plant**, scan the vehicle's label or type the VIN and press **Start the PDI**. The
   checklist for its model opens: 54 items for the Isuzu trucks, 56 for the S07. The PDI gets a
   number (PDI-2026-000012). It cannot start while the kit is unreleased or the vehicle is on the line.
2. Answer every item **OK**, **Not OK** (say what is wrong) or, where offered, **N/A**.
3. Record the odometer, battery voltage and tyre pressures. Tick the diagnostic scan and enter any
   fault codes. Fault codes must be cleared before the PDI can pass.
4. If anything is Not OK, press **Send to rework**. Put each item right, say what was done, and press
   **Rechecked OK**. Then press **Send for approval**.
5. The supervisor opens it from **Approvals → Plant**:
   - **Accept (A)**: the PDI is *Passed* and the vehicle moves to *In the yard*.
   - **Reject (R)**: choose the items and give the reason. The PDI returns to the inspector as
     *Rework*; after the recheck it is sent for approval again.

PDI statuses: *In progress*, *Rework*, *Waiting for approval*, *Passed*, *Cancelled*. A vehicle *In
the yard* is listed under **Vehicles in the plant**. The plant screens stop there today (section 8).

## 5. The label, the vehicle's one page and what is printed

Each vehicle has **one label**, tied to its VIN, with a QR code and a Code 128 barcode of the VIN.
Scanning the QR code with a phone opens the vehicle's page (after sign-in if needed); scanning the
barcode with a handheld scanner into the search box opens the same page. There is no label per
part, case or station.

The page shows the vehicle's history in stages: kit arrival and QC, assembly stations, quality audit,
pre-delivery inspection, yard, sale and warranty, then its workshop visits. Each stage reads *Done*,
*In progress*, *Needs attention* or *Nothing recorded*.

Printed from the vehicle's page, by people whose role includes printing labels (the plant manager,
the supervisors, PDI and QC inspectors). Each print is counted; a reprint carries the same codes.

| Paper | Size | What it is |
|---|---|---|
| Windscreen label | 100 × 60 mm | QR code, barcode, VIN, model |
| Door-jamb label | 90 × 38 mm | The same, smaller |
| Traveller sheet | A4 | Every stage with what is recorded and lines to sign |
| PDI certificate | A4 | For the customer; names no staff. Certifies only when every PDI item's latest result is a pass; otherwise prints as *NOT A CERTIFICATE* |

Lists export to Excel or CSV from their screens: kits, kit shortages, line stations, line defects, QA
audits, PDIs and vehicles in the plant. Column headers use SAP's field names where SAP has one.

## 6. What goes to SAP, and what comes in

EJO never writes into SAP. It produces files that the SAP team loads with their own tools and
checks. Details: [SAP_INTEGRATION.md](SAP_INTEGRATION.md) §3a.

**Out to SAP** (Data Exchange → Postings for SAP), from the day the plant is signed off as cut over:

| File | One line is | Main SAP fields |
|---|---|---|
| PDI usage decisions | A PDI decided: **A** when accepted, **R** each time it was rejected | VDATUM, WERKS, MATNR, SERNR (the VIN), EQUNR, AUFNR, VCODE |
| Vehicles to the yard | A vehicle that passed PDI, received from its production order, once only | BWART 101, BUDAT, WERKS, MATNR, MENGE 1, AUFNR, SERNR, EQUNR |

Each file has a number, control totals and a checksum. SAP's return file marks each line posted or
rejected; the answer shows on the PDI's page under *Sent to SAP*, and a rejected line can be sent
again. Kit releases, station confirmations, defects and QA audits are **not** in the postings files:
they leave as exports, and a kit's SAP inspection lot and material document are typed onto the kit.

**In from SAP or Excel** (Data Exchange), for the day the plant starts. Each file is uploaded,
checked row by row, approved by a second person (the plant manager for the plant's files), loaded,
and can be undone. Layouts and rules: [DATA_MIGRATION.md](DATA_MIGRATION.md) §7b and §7b2.

| File | Brings in |
|---|---|
| Staff | The plant's people, with their roles |
| Plant shipments | Shipments already received |
| Plant vehicles | Vehicles on the line (each at its station), at QA, waiting for PDI or in the yard |
| Plant kits, plant kit issues | Kits at arrival, on hold, released or rejected; open shortages and damage |
| Production, QC and PDI registers | Past history from the plant's Excel registers, read-only, on each vehicle's page |

## 7. A first week

A suggested order. None of it needs a developer. Keep the paper process running beside it.

| Day | What | Who |
|---|---|---|
| Before | Set the real SAP plant code on the branch. Add the plant's people and roles. Compare the two routes with the real line and save new versions where stations or limits differ. | Administrator, Plant Manager |
| 1 | Load the demo (Assembly plant → Demo records), walk every screen with the supervisors, then remove the demo. | Administrator, supervisors |
| 2 | Bring in what is in the plant today: the four plant files, in order. Compare the totals shown before approval with SAP. | IT, Plant Manager |
| 3–4 | Record the next real shipment as it lands; check, release, hold or reject its kits. Run a few vehicles down the line on tablets, raise real defects, pass the gate. | Kit Inspector, Quality Supervisor, operators, QC Inspector |
| 4–5 | Audit one or two finished vehicles, then PDI them. Print labels and a certificate. | QA Auditor, PDI team |
| 5 | Sign the plant off on the cut-over checklist. Make the first postings files and give them to the SAP team to load into a test client. | Plant Manager, IT |
| End | Review station times against standard, first-time-through, top defects, and anything slower than paper. | Plant Manager |

## 8. What it does not do yet

- **No live connection to SAP.** Exchange is by file in both directions: no RFC, BAPI, IDoc or OData.
- **The yard and dispatch are not managed.** A vehicle reaches *In the yard* and stops. There is no
  yard location, dispatch record or yard role. *Sold* exists as a stage name, but no plant screen
  moves a vehicle to it, and vehicle sales are not recorded in EJO.
- **No production planning.** No build schedule, sequence, shift plan or bill of materials. EJO
  records what was built, not what should be built next.
- **No parts consumption on the line.** Parts fitted at a station are not issued from stock, and
  there is no part or serial traceability by station.
- **No link to tools or test equipment.** Torque, brake-roller and alignment values are typed in.
- **No photographs or attachments** on kit issues, defects or audit findings, and **no emails or
  text messages** from the plant screens: waiting work shows on the dashboard and under Approvals.
- **No offline mode.** A tablet needs a network connection.
- **Checklists are fixed in the code.** The kit arrival checks and PDI checklists are version 1 for
  two model families and are changed by a developer (`apps/portal/lib/plant/kits.ts`, `pdi.ts`).
  Only the line routes are edited on screen.
- **Five models only** (NQR, NPR, QLR, QMR, S07). Another model needs a small code change.
- **The QA sample is chosen by a person**, and **plant maintenance** has a department but no screens.
- **Not yet used with real data.** The figures seen so far come from the demo plan.
