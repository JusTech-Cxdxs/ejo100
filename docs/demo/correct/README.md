# Demo files in the correct format

Every file here loads cleanly: no row is rejected or a duplicate. The only notes
the check shows are on the four credit notes (“kept as a credit note”). Load them in
this order (later files refer to earlier ones):

1. `01_SAP_customers_demo.csv` — Customers (SAP)
2. `02_vehicles_demo.xlsx` — Vehicles
3. `05_SAP_suppliers_demo.csv` — Suppliers (SAP)
4. `03a_SAP_parts_200.csv` (a quick first try) or `03_SAP_parts_50k.csv` — Parts (SAP)
5. `04_SAP_opening_stock_demo.csv` — Opening stock (needs the 50,000 parts)
6. `06_SAP_invoice_history_demo.csv` — Invoice history (SAP)
7. `07_PDI_register_demo.xlsx` and `08_production_QC_register_demo.csv` — Registers
8. `09_kit_packing_list_demo.csv` — not an import: open it, copy the lines and paste them into **Assembly plant → Record a shipment** (12 kits: 8 Isuzu, 4 Soueast S07)

Real events are part of the story and load as they are: a PDI that failed and
was re-inspected, a QC rework, credit notes (G2). The same files with planted
mistakes are in [`../with-mistakes/`](../with-mistakes/).
