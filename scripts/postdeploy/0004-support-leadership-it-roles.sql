-- Customer care (the support department), leadership and IT roles exist for
-- every organisation. Adds a role only where it is missing; existing roles and
-- the people in them are never changed. Re-runnable.
INSERT INTO "roles" ("id", "organisationId", "name", "slug", "description", "isSystem", "isSuperAdmin")
SELECT gen_random_uuid()::text, o."id", r.name, r.slug, r.description, true, false
FROM "organisations" o
CROSS JOIN (VALUES
  ('Customer Care', 'customer-care', 'The support department: works support requests, complaints and colleagues'' Get help requests for their branch. Not the Support centre''s set-up.'),
  ('Customer Care Lead', 'customer-care-lead', 'Heads customer care across the organisation: every branch''s requests and complaints, and customer records.'),
  ('Executive', 'executive', 'A director or general manager: every module and all analytics, read-only, with a daily brief. Approves nothing.'),
  ('IT Administrator', 'it-administrator', 'Group IT: people and roles, settings and system health, audit trail and error log, and Enyo. No business transactions.')
) AS r(name, slug, description)
ON CONFLICT ("organisationId", "slug") DO NOTHING;
