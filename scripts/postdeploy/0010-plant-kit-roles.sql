-- D2 Assembly plant: the Quality Supervisor and Kit Inspector roles exist for
-- every organisation. Adds the roles only where they are missing; existing
-- roles and the people in them are never changed. Re-runnable.
INSERT INTO "roles" ("id", "organisationId", "name", "slug", "description", "isSystem", "isSuperAdmin")
SELECT gen_random_uuid()::text, o."id", r.name, r.slug, r.description, true, false
FROM "organisations" o
CROSS JOIN (VALUES
  ('Quality Supervisor', 'quality-supervisor', 'Leads quality at the plant: releases arriving kits to the line, holds or rejects them (never one they checked), and follows shortages to their supplier claims.'),
  ('Kit Inspector', 'kit-inspector', 'Receives kits at the plant: records each shipment, checks every kit against the packing list, and raises shortages, damage, wrong parts and excess.')
) AS r(name, slug, description)
ON CONFLICT ("organisationId", "slug") DO NOTHING;
