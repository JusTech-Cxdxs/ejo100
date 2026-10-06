-- EJO 100 — v23: organisation isolation (multi-organisation readiness).
-- Safe to run more than once. Only ADDS columns / indexes and FILLS empty values;
-- nothing is deleted or overwritten. Run in Supabase → SQL Editor, before or after
-- deploying (the production deploy also adds the columns; this fills them).

-- 1. Columns and indexes (same names Prisma uses).
ALTER TABLE "audit_logs"         ADD COLUMN IF NOT EXISTS "organisationId" TEXT;
ALTER TABLE "warranty_providers" ADD COLUMN IF NOT EXISTS "organisationId" TEXT;
ALTER TABLE "warranty_policies"  ADD COLUMN IF NOT EXISTS "organisationId" TEXT;
CREATE INDEX IF NOT EXISTS "audit_logs_organisationId_createdAt_idx" ON "audit_logs"("organisationId", "createdAt");
CREATE INDEX IF NOT EXISTS "warranty_providers_organisationId_idx"   ON "warranty_providers"("organisationId");
CREATE INDEX IF NOT EXISTS "warranty_policies_organisationId_idx"    ON "warranty_policies"("organisationId");

-- 2. Fill existing rows.
--    a) Audit rows written by a person: that person's organisation.
UPDATE "audit_logs" a SET "organisationId" = u."organisationId"
FROM "users" u
WHERE a."organisationId" IS NULL AND a."userId" = u."id" AND u."organisationId" IS NOT NULL;

--    b) Everything else that existed before this change belongs to the ONE
--       organisation on the platform today. Done only while exactly one exists.
DO $$
DECLARE only_org TEXT;
BEGIN
  IF (SELECT COUNT(*) FROM "organisations") = 1 THEN
    SELECT "id" INTO only_org FROM "organisations" LIMIT 1;
    UPDATE "audit_logs"         SET "organisationId" = only_org WHERE "organisationId" IS NULL;
    UPDATE "warranty_providers" SET "organisationId" = only_org WHERE "organisationId" IS NULL;
    UPDATE "warranty_policies"  SET "organisationId" = only_org WHERE "organisationId" IS NULL;
    -- Staff accounts not yet placed in an organisation (never the platform team).
    UPDATE "users" u SET "organisationId" = only_org
    WHERE u."organisationId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "user_roles" ur JOIN "roles" r ON r."id" = ur."roleId" WHERE ur."userId" = u."id" AND r."isSuperAdmin" = true);
  ELSE
    RAISE NOTICE 'More than one organisation exists — remaining rows left for manual assignment.';
  END IF;
END $$;

-- 3. Check: every active staff account (other than the platform team) belongs
--    to an organisation — expected to return no rows.
SELECT u."email", u."fullName" FROM "users" u
WHERE u."isActive" = true AND u."organisationId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "user_roles" ur JOIN "roles" r ON r."id" = ur."roleId" WHERE ur."userId" = u."id" AND r."isSuperAdmin" = true);
