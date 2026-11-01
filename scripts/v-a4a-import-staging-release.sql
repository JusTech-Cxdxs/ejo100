-- Data Exchange: releasing staged import rows. For a manual run in the Supabase SQL
-- editor (if the Render deploy has not applied it). Safe to run more than once; changes
-- no existing data. Needs the v-A1 script first.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.import_jobs') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "importStagingDays" INTEGER;
  ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "stagedBytes" INTEGER;
  ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "rowsReleasedAt" TIMESTAMP(3);
  ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "rowsReleasedById" TEXT;
END $$;
COMMIT;
