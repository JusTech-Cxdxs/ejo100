-- D1 Assembly plant: the Plant Manager, PDI Supervisor and PDI Inspector roles
-- exist for every organisation. Adds the roles only where they are missing;
-- existing roles and the people in them are never changed. Re-runnable.
INSERT INTO "roles" ("id", "organisationId", "name", "slug", "description", "isSystem", "isSuperAdmin")
SELECT gen_random_uuid()::text, o."id", r.name, r.slug, r.description, true, false
FROM "organisations" o
CROSS JOIN (VALUES
  ('Plant Manager', 'plant-manager', 'Runs the assembly plant: vehicles from kit to yard, their SAP numbers, and approves pre-delivery inspections (never their own).'),
  ('PDI Supervisor', 'pdi-supervisor', 'Leads the PDI bay: inspects, and approves or rejects colleagues'' inspections (never their own).'),
  ('PDI Inspector', 'pdi-inspector', 'Carries out pre-delivery inspections: checklist, fault codes, readings and rechecks after rework.')
) AS r(name, slug, description)
ON CONFLICT ("organisationId", "slug") DO NOTHING;
