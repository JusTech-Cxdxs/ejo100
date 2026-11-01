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

