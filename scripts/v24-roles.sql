-- EJO 100 — v24: every role in the Authorization Catalogue exists for every organisation.
-- Safe to run more than once. Only ADDS roles that are missing; existing roles, their
-- names and the people in them are never changed. Run in Supabase → SQL Editor.

INSERT INTO "roles" ("id", "organisationId", "name", "slug", "description", "isSystem", "isSuperAdmin")
SELECT gen_random_uuid()::text, o."id", r.name, r.slug, r.description, true, false
FROM "organisations" o
CROSS JOIN (VALUES
  ('Organisation Administrator', 'administrator', 'Headquarters: runs the organisation''s set-up across every branch and oversees everything.'),
  ('Branch Administrator', 'branch-administrator', 'One branch: its people and their roles, and oversight of that branch.'),
  ('Receptionist', 'receptionist', 'Front desk: customers, vehicles, opening Job Cards and Vehicle Services, receiving visitors.'),
  ('Workshop Supervisor', 'workshop-supervisor', 'Accepts jobs, assigns technicians, prepares and approves estimates.'),
  ('Technician', 'technician', 'Accepts or turns down jobs, inspects, works and writes estimates.'),
  ('Workshop Manager', 'workshop-manager', 'Final approvals, closing and cancelling jobs, branch approvals.'),
  ('Finance Officer', 'finance-officer', 'Payments, refunds, outside-purchase review and cash.'),
  ('Store Manager', 'store-manager', 'Runs the Store: parts, prices, stock, receipts and releases.'),
  ('Store Officer', 'store-officer', 'Store work: matching, receiving and releasing parts.'),
  ('Warranty HOD', 'warranty-hod', 'Heads Warranty: approves claims, providers and policies.'),
  ('Warranty Officer', 'warranty-officer', 'Registers warranties and prepares claims.'),
  ('Department Head', 'department-head', 'Approves the exit passes of their department.'),
  ('Chief Security Officer', 'chief-security-officer', 'Heads Security: the gate, reception and incidents.'),
  ('Security Officer', 'security-officer', 'The gate: visitors, vehicles and passes in and out.'),
  ('Calendar User', 'calendar-user', 'Keeps a calendar and books appointments.'),
  ('Scheduling Admin', 'scheduling-admin', 'Meeting rooms, aides, and any calendar.'),
  ('Broadcaster', 'broadcaster', 'Sends broadcasts to the organisation.'),
  ('Branch Assistant', 'branch-assistant', 'Helps colleagues who are not at ease with computers, on their behalf and with their password as consent. Every action is recorded for both.'),
  ('Customer Care', 'customer-care', 'The support department: works support requests, complaints and colleagues'' Get help requests for their branch. Not the Support centre''s set-up.'),
  ('Customer Care Lead', 'customer-care-lead', 'Heads customer care across the organisation: every branch''s requests and complaints, and customer records.'),
  ('Executive', 'executive', 'A director or general manager: every module and all analytics, read-only, with a daily brief. Approves nothing.'),
  ('IT Administrator', 'it-administrator', 'Group IT: people and roles, settings and system health, audit trail and error log, and Enyo. No business transactions.'),
  -- Zinox edition
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

-- Check: the roles each organisation now has (expect at least 45 per organisation).
SELECT o."name" AS organisation, COUNT(r."id") AS roles
FROM "organisations" o LEFT JOIN "roles" r ON r."organisationId" = o."id"
GROUP BY o."name";
