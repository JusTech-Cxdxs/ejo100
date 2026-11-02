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
6a. `14_SAP_job_card_history_demo.csv` — Job card history (SAP service orders): one job card per invoice, into the workshop branch (Isolo Branch); the services among them start each vehicle’s next-service clock
6b. `15_SAP_open_job_cards_demo.csv` — Open job cards at the cut-over (into Isolo Branch): eight vehicles from 02 in the workshop at every stage, with estimates, parts issued and deposits; they become live EJO job cards
7. `07_PDI_register_demo.xlsx` and `08_production_QC_register_demo.csv` — Registers
8. `09_kit_packing_list_demo.csv` — not an import: open it, copy the lines and paste them into **Assembly plant → Record a shipment** (12 kits: 8 Isuzu, 4 Soueast S07)
9. `10_plant_shipments_demo.csv`, `11_plant_kits_demo.csv`, `12_plant_kit_issues_demo.csv`, `13_plant_vehicles_demo.csv` — the plant's six demo weeks as files (the same records `npm run demo:reset` loads straight into the plant, as of a fixed Friday). They are the layouts the plant records import reads; until that import lands, load the demo with the reset instead.

Real events are part of the story and load as they are: a PDI that failed and
was re-inspected, a QC rework, credit notes (G2). The same files with planted
mistakes are in [`../with-mistakes/`](../with-mistakes/).
