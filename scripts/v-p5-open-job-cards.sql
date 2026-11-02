-- Manual version for the Supabase SQL editor: the same as scripts/predeploy/0016-open-job-cards.sql.
-- P5 Open job cards brought in at the cut-over: where a job card came from
-- (SAP, LEGACY), its number there and the import that loaded it. Columns and
-- indexes only; re-runnable; skipped on a brand-new database.
DO $$
BEGIN
  IF to_regclass('public.job_cards') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "job_cards" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
  ALTER TABLE "job_cards" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
  ALTER TABLE "job_cards" ADD COLUMN IF NOT EXISTS "importJobId" TEXT;
  CREATE INDEX IF NOT EXISTS "job_cards_importJobId_idx" ON "job_cards"("importJobId");
  CREATE INDEX IF NOT EXISTS "job_cards_branchId_externalSource_externalId_idx" ON "job_cards"("branchId", "externalSource", "externalId");
END $$;
