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
  ('Branch Assistant', 'branch-assistant', 'Helps colleagues who are not at ease with computers, on their behalf and with their password as consent. Every action is recorded for both.')
) AS r(name, slug, description)
ON CONFLICT ("organisationId", "slug") DO NOTHING;

-- Check: the roles each organisation now has (expect at least 18 per organisation).
SELECT o."name" AS organisation, COUNT(r."id") AS roles
FROM "organisations" o LEFT JOIN "roles" r ON r."organisationId" = o."id"
GROUP BY o."name";
