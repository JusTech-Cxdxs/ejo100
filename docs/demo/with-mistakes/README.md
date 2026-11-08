# Demo files with planted mistakes

The same files as in [`../correct/`](../correct/), with mistakes added at the
end of each file, so the import's check has something to catch. Use these to
test the check and to show it in the demo; use `correct/` to load the demo
data cleanly. Row numbers are as EJO reports them ("Row in your file": the
header is row 1). The same list is in `mistakes.json` (the tests read it).

Mistakes marked *against what EJO already holds* show when the file is
checked after the files it depends on are loaded (customers before vehicles
and invoices, the parts catalogue before opening stock).

## 01_SAP_customers_demo.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 32 | No name | Name is required. | Rejected (not loaded) | the check (this row alone) |
| 33 | Email with two @ and no domain | “yetunde.afolabi@@example” is not a valid email, so the customer was kept without one (no portal access until it is corrected). | Loaded with a note | the check (this row alone) |
| 34 | Customer number 0001000105 a second time (row 6 has it) | Same customer number as row 6 of the file; only the first is loaded. | Duplicate (not loaded) | the check (against the other rows in the file) |

## 02_vehicles_demo.xlsx

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 32 | VIN JAANLR85EL7100003 a second time (row 4 has it) | Same chassis number as row 4 of the file; only the first is loaded. | Duplicate (not loaded) | the check (against the other rows in the file) |
| 33 | Neither a VIN nor a plate | No chassis number (VIN) or plate: one of them is needed to know the vehicle. | Rejected (not loaded) | the check (this row alone) |
| 34 | Customer 0009999999 is not in EJO | The customer was not found. Import the customers file first, or check the customer number, email or phone. | Rejected (not loaded) | the check (against what EJO already holds) |

## 03a_SAP_parts_200.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 202 | No part number | Part number is required. | Rejected (not loaded) | the check (this row alone) |
| 203 | No description | Description is required. | Rejected (not loaded) | the check (this row alone) |
| 204 | Part number 8-98100000-0 a second time (row 2 has it) | Same part number (SAP material number) as row 2 of the file; only the first is loaded. | Duplicate (not loaded) | the check (against the other rows in the file) |
| 205 | A negative selling price | Selling price “-6500” is not an amount; it was left out. | Loaded with a note | the check (this row alone) |

## 04_SAP_opening_stock_demo.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 2002 | Negative stock (SAP writes it 3-) | Negative stock (3-) cannot be an opening balance; correct it in SAP or leave the line out. | Rejected (not loaded) | the check (this row alone) |
| 2003 | Part 9-99999999-9 is not in the catalogue | Part 9-99999999-9 is not in this branch’s catalogue. Import the parts file first, or check the number. | Rejected (not loaded) | the check (against what EJO already holds) |
| 2004 | No value and no unit cost | No cost: give the stock value or the unit cost (stock is valued at what it cost). | Rejected (not loaded) | the check (this row alone) |
| 2005 | A batch-managed oil without its batch | This part is batch-tracked: give the batch number (SAP CHARG). | Rejected (not loaded) | the check (against what EJO already holds) |

## 05_SAP_suppliers_demo.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 12 | No supplier name | Name is required. | Rejected (not loaded) | the check (this row alone) |
| 13 | Supplier number 0000300041 a second time (row 2 has it) | Same supplier number as row 2 of the file; only the first is loaded. | Duplicate (not loaded) | the check (against the other rows in the file) |

## 06_SAP_invoice_history_demo.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 128 | Customer 0009999999 is not in EJO | The customer was not found. Import the customers file first, or check the customer number. | Rejected (not loaded) | the check (against what EJO already holds) |
| 129 | Invoice in US dollars | The amount is in USD. Only naira invoices are loaded: give the amount in the company’s currency (SAP DMBTR) instead. | Rejected (not loaded) | the check (this row alone) |
| 130 | No invoice number | Invoice number is required (SAP VBELN or BELNR). | Rejected (not loaded) | the check (this row alone) |
| 131 | 31 June does not exist | “31.06.2024” is not a date. Write it as 14.03.2019, 14/03/2019, 2019-03-14 or 20190314. | Rejected (not loaded) | the check (this row alone) |
| 132 | Invoice 0090001001 a second time in the same file | Same invoice number as row 2 of the file; only the first is loaded. | Duplicate (not loaded) | the check (against the other rows in the file) |

## 07_PDI_register_demo.xlsx

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 62 | No VIN | Chassis number (VIN) is required. | Rejected (not loaded) | the check (this row alone) |
| 63 | 30 February does not exist | “30/02/2024” is not a date. Write it as 14.03.2019, 14/03/2019, 2019-03-14 or 20190314. | Rejected (not loaded) | the check (this row alone) |

## 08_production_QC_register_demo.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 122 | No date | Date is required. | Rejected (not loaded) | the check (this row alone) |
| 123 | Register "Paint shop" is not Production, QC or PDI | “Paint shop” is not Production, QC or PDI. | Rejected (not loaded) | the check (this row alone) |

## 09_kit_packing_list_demo.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 14 | A part name where the VIN should be | Line 14: “BRAKE PAD SET” is not a VIN or frame number. | Rejected (not loaded) | the check (this row alone) |
| 15 | VIN JAANLR85EL7210001 twice | Line 15: JAANLR85EL7210001 is already on line 2. | Duplicate (not loaded) | the check (against the other rows in the file) |
| 16 | A model the plant does not build (D-MAX) | Line 16: choose the model (NQR, NPR, QLR, QMR, S07). | Rejected (not loaded) | the check (this row alone) |
| 17 | 900 cases for one kit | Line 17: 900 cases is not a likely number for one kit. | Rejected (not loaded) | the check (this row alone) |

## 10_plant_shipments_demo.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 9 | No supplier | Say who shipped the kits (the supplier). | Rejected (not loaded) | the check (this row alone) |
| 10 | Shipment SHP1 twice | Same shipment reference as row 2 of the file; only the first is loaded. | Duplicate (not loaded) | the check (against the other rows in the file) |
| 11 | Arrival in the future (2027) | Arrived 2027-01-15 is in the future. | Rejected (not loaded) | the check (this row alone) |

## 11_plant_kits_demo.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 82 | A cancelled kit | A cancelled kit never came: leave it out. | Rejected (not loaded) | the check (this row alone) |
| 83 | VIN JAANLR85EL7230001 twice | Same chassis number as row 2 of the file; only the first is loaded. | Duplicate (not loaded) | the check (against the other rows in the file) |
| 84 | A shipment that is not in the shipments file (SHP77) | Shipment “SHP77” is not at this plant in EJO. Import the shipments file first, or give the kit’s SHP number. | Rejected (not loaded) | the check (against what EJO already holds) |

## 12_plant_kit_issues_demo.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 16 | A kind EJO does not know (Lost) | “Lost” is not a kind EJO knows: Shortage, Damage, Wrong part or Excess. | Rejected (not loaded) | the check (this row alone) |
| 17 | No description | Say what is wrong (the description is required). | Rejected (not loaded) | the check (this row alone) |
| 18 | A kit that is not in EJO | This VIN has no kit at this plant in EJO. Import the kits file first, or check the VIN. | Rejected (not loaded) | the check (against what EJO already holds) |

## 13_plant_vehicles_demo.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 67 | A vehicle already sold | A sold vehicle is the customer’s: bring it in with the vehicles file (and its warranty), not the plant’s. | Rejected (not loaded) | the check (this row alone) |
| 68 | VIN JAANLR85EL7230001 twice | Same chassis number as row 2 of the file; only the first is loaded. | Duplicate (not loaded) | the check (against the other rows in the file) |
| 69 | Waiting for PDI with no gate date | Past the line, the day it passed the final quality gate is required (Gate passed). | Rejected (not loaded) | the check (this row alone) |
| 70 | A model the plant does not build (D-MAX) | “D-MAX” is not a model the plant builds: NQR, NPR, QLR, QMR or S07. | Rejected (not loaded) | the check (this row alone) |

## 14_SAP_job_card_history_demo.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 124 | Customer 0009999999 is not in EJO, and no vehicle to find the owner by | The customer was not found. Import the customers file first (and the vehicles file, when the job names only the vehicle), or check the customer number. | Rejected (not loaded) | the check (against what EJO already holds) |
| 125 | Completed two days before it was opened | Completed on 2024-05-08 is before it was opened on 2024-05-10. | Rejected (not loaded) | the check (this row alone) |
| 126 | No job number | Job number is required (the SAP order number, AUFNR, or the old job card number). | Rejected (not loaded) | the check (this row alone) |
| 127 | Job card 480102 a second time in the same file | Same job number as row 2 of the file; only the first is loaded. | Duplicate (not loaded) | the check (against the other rows in the file) |
| 128 | A job card still open (status REL) | Status “REL”: a job still open belongs in the open job cards file, not in history. | Rejected (not loaded) | the check (this row alone) |
| 129 | A job card of another branch in this branch’s file | This row is for the branch “Afprint Assembly Plant”, but this import loads into Isolo Branch. Import it into its own branch. | Rejected (not loaded) | the check (against what EJO already holds) |

## 15_SAP_open_job_cards_demo.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 10 | A job card already closed (CLSD): it belongs in the history file | Stage “CLSD”: a closed, checked-out or cancelled job card belongs in the job card history file, not here. | Rejected (not loaded) | the check (this row alone) |
| 11 | A stage EJO does not know | “Somewhere” is not a stage EJO knows: use Checked in, In progress, Awaiting parts, Quality check, Awaiting customer approval, Completed or Ready for collection (or SAP’s CRTD, REL, TECO). | Rejected (not loaded) | the check (this row alone) |
| 12 | No chassis number or plate | Which vehicle is it? Give the chassis number (VIN) or the plate: an open job card is on a vehicle that is in EJO. | Rejected (not loaded) | the check (this row alone) |
| 13 | Vehicle JAANLR85EL7100002 a second time (row 3 has it): one open job card per vehicle | Same chassis number as row 3 of the file; only the first is loaded. | Duplicate (not loaded) | the check (against the other rows in the file) |
| 14 | Opened on a date in the future | The opening date 2027-03-15 is in the future. | Rejected (not loaded) | the check (this row alone) |
| 15 | A vehicle EJO does not have | The vehicle is not in EJO. Import the vehicles file first (the open job card needs the vehicle it is on), or check the chassis number or plate. | Rejected (not loaded) | the check (against what EJO already holds) |

## 16_SAP_warranties_demo.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 22 | No warranty number | Warranty number is required (SAP MGANR or the old system’s warranty or certificate number). | Rejected (not loaded) | the check (this row alone) |
| 23 | A warranty that starts in the future | The start date 2027-03-15 is in the future: a warranty starts on the day the vehicle or part was delivered. | Rejected (not loaded) | the check (this row alone) |
| 24 | A policy EJO does not have | There is no warranty policy “DEMO-XYZ-9Y” in EJO. Create it under Warranty → Policies (its code or name), or give the months and km so it can be found. | Rejected (not loaded) | the check (against what EJO already holds) |
| 25 | A vehicle EJO does not have | The vehicle is not in EJO. Import the vehicles file first (a vehicle warranty needs the vehicle it covers), or check the chassis number or plate. | Rejected (not loaded) | the check (against what EJO already holds) |
| 26 | Warranty W-2021-0402 a second time (row 3 has it) | Same warranty number as row 3 of the file; only the first is loaded. | Duplicate (not loaded) | the check (against the other rows in the file) |
| 27 | A status EJO does not know | “Pending?” is not a warranty status EJO knows: use Active, Suspended, Void or Transferred. | Rejected (not loaded) | the check (this row alone) |

## 17_SAP_open_claims_demo.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 10 | A settled claim: it is history | Stage “Settled”: a settled or cancelled claim is history and stays in the old system; bring in the claims still open. | Rejected (not loaded) | the check (this row alone) |
| 11 | A warranty EJO does not have | Warranty W-1999-0001 is not in EJO. Import the warranties file first (the claim is on a warranty), or check the number. | Rejected (not loaded) | the check (against what EJO already holds) |
| 12 | No complaint | The complaint is required: what the customer reported. | Rejected (not loaded) | the check (this row alone) |
| 13 | Partially accepted with no accepted amount | Partially accepted: give the amount the provider accepted. | Rejected (not loaded) | the check (this row alone) |
| 14 | Claim C-2026-0181 a second time (row 3 has it) | Same claim number as row 3 of the file; only the first is loaded. | Duplicate (not loaded) | the check (against the other rows in the file) |

## 18_SAP_open_services_and_bookings_demo.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 13 | No booking number | Booking or service number is required (SAP AUFNR or QMNUM, or the diary’s booking reference). | Rejected (not loaded) | the check (this row alone) |
| 14 | A service already collected: it is history | Stage “Collected”: a closed, collected or cancelled service is history (load it with the job card history), not an open one. | Rejected (not loaded) | the check (this row alone) |
| 15 | A booking without its day | A booking needs its day (Booked for): when is the customer expected? | Rejected (not loaded) | the check (this row alone) |
| 16 | A vehicle EJO does not have | The vehicle is not in EJO. Import the vehicles file first (a service or a booking is for a vehicle in EJO), or check the chassis number or plate. | Rejected (not loaded) | the check (against what EJO already holds) |
| 17 | Vehicle JAANLR85EL7100013 a second time (row 2 has it): one open visit per vehicle | Same chassis number as row 2 of the file; only the first is loaded. | Duplicate (not loaded) | the check (against the other rows in the file) |
| 18 | In the workshop since a day in the future | Checked in on 2027-03-15, which is in the future: a vehicle in the workshop came in already. | Rejected (not loaded) | the check (this row alone) |

## 19_SAP_staff_demo.csv

| Row | What is wrong | EJO says | Outcome | Caught by |
| --- | --- | --- | --- | --- |
| 14 | No work email | Work email is required: the person signs in with it and their invitation goes to it. | Rejected (not loaded) | the check (this row alone) |
| 15 | An administrator role in a file | “Administrator”: the organisation’s administrators are added by hand on the Users page, never by a file. | Rejected (not loaded) | the check (this row alone) |
| 16 | A branch the organisation does not have | There is no branch “Lekki Branch” in this organisation. Use the branch’s name, code or SAP plant as on the Structure page. | Rejected (not loaded) | the check (against what EJO already holds) |
| 17 | emeka.okoro@staff.example.com a second time (row 2 has it) | Same email as row 2 of the file; only the first is loaded. | Duplicate (not loaded) | the check (against the other rows in the file) |
| 18 | An employee ID with spaces and signs | “EMP 99!” is not an employee ID (letters, digits and dashes). | Rejected (not loaded) | the check (this row alone) |
| 19 | A role EJO does not have | There is no role “Chief Cook” in this organisation. Use the role’s name as on the Roles page. | Rejected (not loaded) | the check (against what EJO already holds) |

