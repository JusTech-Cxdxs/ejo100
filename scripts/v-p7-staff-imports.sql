-- Manual version for the Supabase SQL editor: the same as scripts/predeploy/0021-staff-imports.sql.
-- P7 Staff brought in from SAP HR or a spreadsheet: where each came from, the
-- personnel number there, the import that loaded them, and when their
-- set-password invitation was sent. Columns and indexes only; re-runnable;
-- skipped on a brand-new database.
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "importJobId" TEXT;
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMP(3);
  CREATE INDEX IF NOT EXISTS "users_importJobId_idx" ON "users"("importJobId");
  CREATE INDEX IF NOT EXISTS "users_organisationId_externalSource_externalId_idx" ON "users"("organisationId", "externalSource", "externalId");
END $$;
