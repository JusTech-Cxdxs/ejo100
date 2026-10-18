# EJO 100 — Zinox Technologies edition: the business and its records

Zinox Technologies Limited (Gbagada Industrial Layout, Lagos; regional office in Garki, Abuja) designs
and assembles computing devices in West Africa's first computerised digital assembly plant, and sells
clean-energy (iPower) and household (iTEC) products. It sells to **individuals** (through Konga and
its own showrooms), **dealers and wholesalers** (Computer Village and tech hubs nationwide), **corporate
accounts** (banks, telcos, schools) and **government** (ministries, INEC, census), and moves bulk stock
through its distribution partner **TD Africa**. It runs on Microsoft Dynamics 365 for finance; this
platform is the operating system for the floor, the warehouses, the sales offices and the service desk,
and exports what finance needs.

Everything below is a record the platform keeps, numbered the way the business already talks
(`SO-2026-000123`), with a status that only moves through the steps listed, by the role named.

## 1. Product families (the Catalogue)

| Family | Sub-brand | Examples (seeded) | Made or bought |
| --- | --- | --- | --- |
| Laptops & notebooks | Zinox | Prestige Pro2 (i5-1235U, 14.1" FHD touch), Elite Pro2 (i7-1255U), Phoenix (i3), Bijimi Pro (Pentium N6000) | **Assembled** on the line from a Bill of Materials |
| Desktops & all-in-ones | Zinox | Phantom, Phantom Pro, Apex Pro2, Quantum Pro2, Avid Classic | **Assembled** |
| Tablets | Zinox | Zpad X9 Pro, Zpad X9, Kids Legacy Tab Pro | Bought finished (imported), kitted and imaged locally |
| Monitors & Smart Boards | Zinox | 24" / 27" monitors, 65" / 75" / 86" interactive Smart Boards | Bought finished |
| Power | iPower | 1.5–10 kVA hybrid inverters, 200 Ah deep-cycle and lithium batteries, 350–550 W solar panels, solar kits | Bought finished; **kits are assembled** (inverter + batteries + panels per site design) |
| Appliances | iTEC | Generators (2.5–10 kVA), Smart TVs (32"–75"), rechargeable fans, stabilisers, air conditioners, refrigerators, microwaves | Bought finished |

A **Product** (`PRD-…`) is one sellable model with a SKU, family, sub-brand, unit of measure, serial tracking
(every computer, tablet, inverter, generator and TV is **serialised**; fans and cables are quantity-tracked),
a default warranty policy, and a **Bill of Materials (BOM)** when it is assembled. A **Configuration**
is a sellable variant of a product (RAM, SSD, OS edition, keyboard layout — the Naira-sign keyboard is
standard), each with its own SKU suffix and BOM overrides. The catalogue keeps **Software images and
packages** (Windows 11 Pro image, Office, Kaspersky, Zinox Care agent) that the line installs and the
line supervisor confirms.

## 2. Parts and the two warehouses

* **Parts Warehouse (components)** — imported components received against purchase orders from
  Procurement: casings, motherboards, CPUs, RAM, SSDs, panels, keyboards, batteries, power adapters,
  packaging. Receipts (`GRN-…`) are counted against the PO, inspected (Incoming QC), and binned.
  Stock is kept per **bin** per warehouse; serialised components (motherboards, panels) keep their
  own serials; others are quantity-tracked with lot numbers.
* **Finished Goods Warehouse (store)** — every unit that passed QA, by serial, by location
  (Gbagada FG store, Abuja store, Showroom floor, TD Africa consignment, in-transit). Finished imported
  products (tablets, monitors, iPower, iTEC) go straight here after Incoming QC.
* **Showroom** — a location of the finished-goods warehouse with its own display stock and a
  walk-in sales desk.

Movements are explicit records: **Stock transfer** (`TRF-…`, between warehouses/locations, with
dispatch and receipt confirmation), **Picking** for a sales order, **Issue to production** against a
build order, **Return to stock**, **Adjustment** (count variance, approved by the Warehouse Manager).
Reorder levels and lead times per part drive the **Reorder suggestions** Procurement works from.

## 3. Procure-to-assemble

1. **Purchase requisition** (`PRQ-…`) — raised by Production Planning (from BOM shortages) or the
   Warehouse (reorder level), approved by the Head of Procurement; above the threshold the Executive
   approves too.
2. **Purchase order** (`PO-…`) — to a **Supplier** (local or foreign; currency, incoterms, expected
   date, shipment reference). Procurement sends it, Finance confirms payment terms.
3. **Shipment / import** (`SHP-…`) — tracking of containers/airfreight: ETD, ETA, customs clearance,
   duty paid, arrival at Gbagada. The gate records the vehicle (Security module).
4. **Goods receipt** (`GRN-…`) — counted against the PO, with **Incoming QC** (sample tested, pass/fail,
   quarantine on fail), then binned. Discrepancies raise a **Supplier claim**.

## 4. Build (the assembly line)

* A **Build order** (`BLD-…`) asks the line for N units of a configuration, either **to stock** (planned
  from forecasts) or **for an order** (linked to a sales order, with the customer's software and
  branding requirements). Planning checks BOM availability; shortages create requisitions.
* **Material issue** — the parts warehouse issues the BOM quantities to the line (serialised components
  recorded against the build order).
* **Assembly** — the line builds units; each **Unit** gets its serial number when the chassis is
  closed and a **Unit traveller** that records, per station: assembly (who, when), software image
  and packages installed, **Line supervisor check** (checklist per configuration: RAM seated, SSD,
  keyboard layout, BIOS version, OS activation, packages present, labels, accessories in box),
  **QA test** (burn-in hours, keyboard, display, ports, battery, Wi-Fi, camera — pass/fail per item),
  rework if failed, **packing** (box, accessories, warranty card), and **release to finished goods**.
* **Line supervisor** and **QA inspector** are separate people; QA cannot be done by the person who built
  the unit. Every result is stored per unit and per build order, so a serial can be traced back to its
  components, image, tester and date forever.

## 5. Sell (Order-to-cash)

Channels: **Walk-in / showroom**, **Dealer (wholesale)**, **Corporate**, **Government / tender**,
**Distributor (TD Africa)**, **Konga (online)**, **Project**.

1. **Enquiry / Quotation** (`QTE-…`) — a sales officer prices a configuration from the **Price list**
   that applies to the customer's channel (retail, dealer tier 1/2/3, corporate, distributor). Discounts
   beyond the sales officer's limit need the Sales Manager; beyond that, the Commercial Director.
2. **Sales order** (`SO-…`) — the accepted quotation. For assembled products it creates or links a
   **Build order**; for stock items it reserves serials.
3. **Pro-forma invoice** (`PFI-…`) — issued by Billing; the customer pays by transfer, cheque, POS or
   cash; Finance records **Payments** and confirms. Credit terms exist for approved dealers and
   corporates (credit limit and days, set by Finance).
4. **Goods release note** (`GRN-R-…`) — once Finance confirms payment (or credit), the Warehouse picks
   the serials and prints the release note; **Dispatch** (`DSP-…`) records the vehicle, driver and
   waybill; the gate releases it (Security module). The customer (or TD Africa) signs the **Delivery
   note**; serials are now "sold" and their warranty clock starts (or starts on activation).
5. **Invoice** (`INV-…`) — the tax invoice for the delivered goods, exported to D365.
6. **Returns / RMA** (`RMA-…`) — dead-on-arrival or wrong item, approved by the Sales Manager, received
   back into quarantine.

The **Showroom** runs the same records over the counter: quotation → order → payment → release, with
display units and demo stock handled as locations.

## 6. Warranty and after-sales

* Every serial carries its **Warranty record** from the day it is sold (or activated by the customer or
  dealer on the portal). Policies per product family: e.g. 12 months computing, 24 months inverter,
  6 months battery, 12 months generator engine.
* **Warranty claim** (`WCL-…`) — logged by Customer Care, the Service Centre, a dealer (portal) or the
  customer (portal), against a serial: fault, proof of purchase, triage, approval by the Warranty
  Manager, **Service job** (`SVC-…`) at the Service Centre (diagnosis, parts used from the service
  parts store, repair or replacement, QA, return), and the **Warranty ledger** entry that charges the
  cost to the right department (production defect, component supplier, transit damage, user damage —
  not covered). Supplier-caused failures raise a **Supplier claim**.
* **Out-of-warranty service** uses the same service job with a quotation and payment.

## 7. Channel pricing and the dealer portal

* **Price lists** (retail, dealer tiers, corporate, distributor, government) with effective dates;
  the Pricing Committee (Commercial Director + Finance) approves changes.
* **Daily price broadcast** — every working day at 08:00 the platform publishes the dealer price list
  to every active dealer (portal, email, WhatsApp-ready text), with changes highlighted. A dealer sees
  only their tier.
* **Dealer portal** (customer portal, dealer role): prices, stock availability by family, place
  orders, upload payment proof, download PFIs and invoices, register serials they sold and raise
  warranty claims, see their credit position and statement.
* **Customer portal** (individual/corporate): their devices (by serial), warranty status, claims,
  invoices, support requests, Enyo help.

## 8. Projects and tenders

A **Project** (`PRJ-…`) groups a government or corporate contract: tender reference, contract value,
milestones, deliverables (quantities per configuration), site deployments (schools, polling units),
and links its sales orders, build orders, dispatches and service jobs. Project Managers track
delivery and acceptance certificates; the Executive sees margin and status.

## 9. Departments and roles (added to the standard EJO 100 roles)

| Department | Roles (slug) | Decides |
| --- | --- | --- |
| Commercial / Sales | Sales Officer (`sales-officer`), Showroom Officer (`showroom-officer`), Sales Manager (`sales-manager`), Commercial Director (`commercial-director`), Key Account Manager (`key-account-manager`) | Quotations, discounts within limits, orders, dealer onboarding, price lists |
| Billing & Finance | Billing Officer (`billing-officer`), Finance Officer, Finance Manager (`finance-manager`), Credit Controller (`credit-controller`) | PFIs, payments, credit limits, release of goods, invoices, D365 export |
| Production | Production Planner (`production-planner`), Line Supervisor (`line-supervisor`), Assembler (`assembler`), QA Inspector (`qa-inspector`), Production Manager (`production-manager`) | Build orders, material issue, unit checks, QA pass/fail, release to stock |
| Warehouse & Logistics | Parts Warehouse Officer (`parts-warehouse-officer`), Finished Goods Officer (`fg-warehouse-officer`), Warehouse Manager (`warehouse-manager`), Dispatch Officer (`dispatch-officer`) | Receipts, bins, transfers, picking, release notes, dispatch |
| Procurement | Procurement Officer (`procurement-officer`), Head of Procurement (`procurement-head`) | Requisitions, POs, suppliers, shipments |
| Warranty & Service | Service Technician (`service-technician`), Service Centre Supervisor (`service-supervisor`), Warranty Manager (`warranty-manager`) | Claims, service jobs, ledger |
| Projects | Project Manager (`project-manager`) | Projects, milestones, acceptance |
| Plus the platform's existing roles: administrator, branch administrator, customer care (+ lead), security, scheduling, broadcaster, executive, IT administrator, department head, branch assistant. |

Segregation of duties the platform enforces: the person who builds a unit cannot QA it; the person who
raises a requisition cannot approve it; a sales officer cannot confirm their own payment; the warehouse
cannot release goods Finance has not cleared; nobody approves their own discount.

## 10. Numbering

`PRD` product · `BOM` bill of materials · `PRQ` requisition · `PO` purchase order · `SHP` shipment ·
`GRN` goods receipt · `BLD` build order · `UNT` unit traveller (serial) · `TRF` transfer · `QTE` quotation ·
`SO` sales order · `PFI` pro-forma · `REL` goods release note · `DSP` dispatch · `INV` invoice · `RMA` return ·
`WTY` warranty record · `WCL` warranty claim · `SVC` service job · `PRJ` project · `PL` price list ·
`PB` price broadcast. All are `PREFIX-YYYY-000001` per organisation, like Job Cards today.
