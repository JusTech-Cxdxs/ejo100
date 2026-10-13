-- V1 closure: the Branch Assistant role (assisted sessions) exists for every
-- organisation. Adds the role only where it is missing; existing roles and the
-- people in them are never changed. Re-runnable.
INSERT INTO "roles" ("id", "organisationId", "name", "slug", "description", "isSystem", "isSuperAdmin")
SELECT gen_random_uuid()::text, o."id", 'Branch Assistant', 'branch-assistant',
       'Helps colleagues who are not at ease with computers, on their behalf and with their password as consent. Every action is recorded for both.',
       true, false
FROM "organisations" o
ON CONFLICT ("organisationId", "slug") DO NOTHING;
