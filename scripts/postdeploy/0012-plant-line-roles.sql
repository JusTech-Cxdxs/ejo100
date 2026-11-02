-- D3 Assembly line: the Production Supervisor, Line Operator, QC Inspector and
-- QA Auditor roles exist for every organisation. Adds the roles only where
-- they are missing; existing roles and the people in them are never changed.
INSERT INTO "roles" ("id", "organisationId", "name", "slug", "description", "isSystem", "isSuperAdmin")
SELECT gen_random_uuid()::text, o."id", r.name, r.slug, r.description, true, false
FROM "organisations" o
CROSS JOIN (VALUES
  ('Production Supervisor', 'production-supervisor', 'Runs the line: every vehicle at its station, each station''s checks and times, defects and rework; edits the routes.'),
  ('Line Operator', 'line-operator', 'Builds at a station: records its checks and times, raises defects and records rework.'),
  ('QC Inspector', 'qc-inspector', 'Quality on the line: end-of-line tests, the final gate and defect verification (never a check they recorded).'),
  ('QA Auditor', 'qa-auditor', 'The daily QA audit: a sample of finished vehicles re-inspected and scored.')
) AS r(name, slug, description)
ON CONFLICT ("organisationId", "slug") DO NOTHING;
