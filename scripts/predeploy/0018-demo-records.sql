-- D2 The workshop demo: demo_records lists the demo organisation's demo
-- records that carry no externalSource of their own, so a reset removes
-- exactly what the last load made. New table and indexes only; re-runnable;
-- skipped on a brand-new database (db push creates it there).
DO $$
BEGIN
  IF to_regclass('public.organisations') IS NULL THEN
    RETURN;
  END IF;
  CREATE TABLE IF NOT EXISTS "demo_records" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "demo_records_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "demo_records_model_recordId_key" ON "demo_records"("model", "recordId");
  CREATE INDEX IF NOT EXISTS "demo_records_organisationId_model_idx" ON "demo_records"("organisationId", "model");
END $$;
