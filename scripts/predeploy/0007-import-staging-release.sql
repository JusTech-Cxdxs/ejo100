-- Data Exchange: releasing the staged copy of a finished import's file after a
-- set period (Organisation.importStagingDays; null = 30 days, 0 = never), and
-- the space each import's staged rows take. New columns only; re-runnable.
-- Skipped on a brand-new database.
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
