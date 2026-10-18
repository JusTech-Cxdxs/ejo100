-- EJO 100 — Zinox edition: the manufacturing, warehouse, sales, procurement, service and
-- project roles exist for every organisation. Safe to run more than once: only ADDS roles that
-- are missing; existing roles, their names and the people in them are never changed.

INSERT INTO "roles" ("id", "organisationId", "name", "slug", "description", "isSystem", "isSuperAdmin")
SELECT gen_random_uuid()::text, o."id", r.name, r.slug, r.description, true, false
FROM "organisations" o
CROSS JOIN (VALUES
  -- Commercial
  ('Sales Officer', 'sales-officer', 'Quotations and orders for walk-in, dealer and corporate customers, within their discount limit.'),
  ('Showroom Officer', 'showroom-officer', 'The showroom desk: display stock, over-the-counter quotations, orders and payments.'),
  ('Key Account Manager', 'key-account-manager', 'Corporate, government and distributor accounts (TD Africa): quotations, orders, tenders.'),
  ('Sales Manager', 'sales-manager', 'Approves discounts beyond officers'' limits, returns, dealer onboarding; sees every order.'),
  ('Commercial Director', 'commercial-director', 'Price lists and the daily dealer price broadcast, large discounts, channel policy.'),
  -- Billing & Finance
  ('Billing Officer', 'billing-officer', 'Pro-forma invoices, tax invoices and statements.'),
  ('Credit Controller', 'credit-controller', 'Dealer and corporate credit limits, terms and overdue follow-up.'),
  ('Finance Manager', 'finance-manager', 'Confirms payments, clears goods for release, approves refunds and the finance export.'),
  -- Production
  ('Production Planner', 'production-planner', 'Build orders, material availability, requisitions from shortages.'),
  ('Assembler', 'assembler', 'Builds units on the line and records each station step on the unit traveller.'),
  ('Line Supervisor', 'line-supervisor', 'Checks every unit against its configuration: components, software image, packages, labels.'),
  ('QA Inspector', 'qa-inspector', 'Tests every unit (burn-in, ports, display, battery); passes or fails it. Never the builder.'),
  ('Production Manager', 'production-manager', 'Releases build orders, approves rework and scrap, owns the line.'),
  -- Warehouse & Logistics
  ('Parts Warehouse Officer', 'parts-warehouse-officer', 'Receives imported components, incoming QC, bins, issues to production.'),
  ('Finished Goods Officer', 'fg-warehouse-officer', 'Finished goods by serial: locations, picking, goods release notes.'),
  ('Dispatch Officer', 'dispatch-officer', 'Dispatches released goods: vehicle, driver, waybill, delivery confirmation.'),
  ('Warehouse Manager', 'warehouse-manager', 'Both warehouses: transfers, adjustments, counts, reorder levels.'),
  -- Procurement
  ('Procurement Officer', 'procurement-officer', 'Requisitions, purchase orders, suppliers and shipments.'),
  ('Head of Procurement', 'procurement-head', 'Approves requisitions and purchase orders; supplier claims.'),
  -- Warranty & Service
  ('Service Technician', 'service-technician', 'Diagnoses and repairs units on service jobs; records parts used.'),
  ('Service Supervisor', 'service-supervisor', 'Runs the Service Centre: assigns jobs, QA after repair, returns to customer.'),
  ('Warranty Manager', 'warranty-manager', 'Approves warranty claims, replacements and the warranty ledger; supplier claims.'),
  -- Projects
  ('Project Manager', 'project-manager', 'Government and corporate projects: milestones, deliveries, acceptance.')
) AS r(name, slug, description)
ON CONFLICT ("organisationId", "slug") DO NOTHING;
