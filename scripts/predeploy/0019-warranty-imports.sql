-- P6 Warranties and open warranty claims brought in at the cut-over: where
-- each came from (SAP, LEGACY), its number there and the import that loaded
-- it. Columns and indexes only; re-runnable; skipped on a brand-new database.
DO $$
BEGIN
  IF to_regclass('public.warranties') IS NULL OR to_regclass('public.warranty_claims') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "warranties" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
  ALTER TABLE "warranties" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
  ALTER TABLE "warranties" ADD COLUMN IF NOT EXISTS "importJobId" TEXT;
  CREATE INDEX IF NOT EXISTS "warranties_importJobId_idx" ON "warranties"("importJobId");
  CREATE INDEX IF NOT EXISTS "warranties_externalSource_externalId_idx" ON "warranties"("externalSource", "externalId");
  ALTER TABLE "warranty_claims" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
  ALTER TABLE "warranty_claims" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
  ALTER TABLE "warranty_claims" ADD COLUMN IF NOT EXISTS "importJobId" TEXT;
  CREATE INDEX IF NOT EXISTS "warranty_claims_importJobId_idx" ON "warranty_claims"("importJobId");
  CREATE INDEX IF NOT EXISTS "warranty_claims_externalSource_externalId_idx" ON "warranty_claims"("externalSource", "externalId");
END $$;
