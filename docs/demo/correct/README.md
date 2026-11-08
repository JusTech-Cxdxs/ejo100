# Demo files in the correct format

Every file here loads cleanly: no row is rejected or a duplicate. The only notes
the check shows are on the four credit notes (“kept as a credit note”). Load them in
this order (later files refer to earlier ones):

0. `19_SAP_staff_demo.csv` — Staff (SAP HR): twelve invented colleagues at Isolo and Afprint, on a domain nobody receives mail for; accounts come in switched off until an Organisation Administrator sends the invitations (load first: the open job cards find their technicians by employee ID)
1. `01_SAP_customers_demo.csv` — Customers (SAP)
2. `02_vehicles_demo.xlsx` — Vehicles
3. `05_SAP_suppliers_demo.csv` — Suppliers (SAP)
4. `03a_SAP_parts_200.csv` (a quick first try) or `03_SAP_parts_50k.csv` — Parts (SAP)
5. `04_SAP_opening_stock_demo.csv` — Opening stock (needs the 50,000 parts)
6. `06_SAP_invoice_history_demo.csv` — Invoice history (SAP)
6a. `14_SAP_job_card_history_demo.csv` — Job card history (SAP service orders): one job card per invoice, into the workshop branch (Isolo Branch); the services among them start each vehicle’s next-service clock
6b. `15_SAP_open_job_cards_demo.csv` — Open job cards at the cut-over (into Isolo Branch): eight vehicles from 02 in the workshop at every stage, with estimates, parts issued and deposits; they become live EJO job cards
6b2. `18_SAP_open_services_and_bookings_demo.csv` — Open services and bookings at the cut-over (into Isolo Branch): eight bookings for the days after (vehicles 13–20, with their times) and three services already in the workshop; a booking waits for its customer, a service carries on at its stage
6c. `16_SAP_warranties_demo.csv` — Warranties sold before EJO (the workshop demo’s policies must be in EJO): fourteen vehicles from 02 under the Isuzu and Soueast policies (two found from their months and km; most have ended and are kept for their history), four batteries and two sets of brake pads fitted before EJO, one suspended warranty; they become EJO warranties, active from the day they started
6d. `17_SAP_open_claims_demo.csv` — Open warranty claims at the cut-over: eight claims on the warranties of 16 still in force, one at every open stage, from a draft to one accepted and one rejected; they become live EJO claims
7. `07_PDI_register_demo.xlsx` and `08_production_QC_register_demo.csv` — Registers
8. `09_kit_packing_list_demo.csv` — not an import: open it, copy the lines and paste them into **Assembly plant → Record a shipment** (12 kits: 8 Isuzu, 4 Soueast S07)
9. The plant's records, into **Afprint Assembly Plant** (staff from 19 first: the inspectors and deciders are named by employee ID), in this order — the same six demo weeks `npm run demo:reset` loads straight into the plant, as of a fixed Friday (use one or the other, not both):
   1. `10_plant_shipments_demo.csv` — Plant shipments: each becomes an EJO shipment (SHP number), its old reference kept
   2. `13_plant_vehicles_demo.csv` — Plant vehicles: on the line (with their current station), in quality audit, waiting for PDI and in the yard
   3. `11_plant_kits_demo.csv` — Plant kits: on their shipments, from arrived to released (linked to their vehicle from 13) or rejected
   4. `12_plant_kit_issues_demo.csv` — Plant kit issues: shortages and damage, open, claimed from the supplier or resolved

Real events are part of the story and load as they are: a PDI that failed and
was re-inspected, a QC rework, credit notes (G2). The same files with planted
mistakes are in [`../with-mistakes/`](../with-mistakes/).
