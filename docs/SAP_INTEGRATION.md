# EJO 100 and SAP

How EJO 100 lines up with SAP ECC / S/4HANA, record by record, so that data
moves between the two without retyping or reshaping. EJO keeps the numbers
SAP knows each record by, in SAP's own terms, beside its own number.

This document grows with each release. **Today** EJO reads SAP extracts
(Data Exchange imports) and keeps every SAP number it is given. **Next (C1)**
it writes the daily files SAP posts from, takes SAP's refreshes back in, and
reconciles the two; those sections are marked *coming in C1*.

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

## 3. The daily files *(coming in C1)*

C1 adds, through Data Exchange, without new infrastructure:

- **Outbound files** EJO writes for SAP each day, in SAP's own field names: new
  customers, goods issues for jobs, workshop billing, plant events (PDI usage
  decisions, vehicles to the yard, sales).
- **Inbound refreshes** from SAP: the master data changed since the last file.
- **Every sync situation** handled and listed: a record changed on both sides,
  deleted in SAP, a number SAP rejected, a posting failed and fixed.
- **Reconciliation**: counts and values on both sides, every difference
  explained, and the "Where this came from" box showing the SAP postings that
  included each record.
