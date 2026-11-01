-- Search and tracking, for a manual run in the Supabase SQL editor (if the Render deploy
-- has not applied it). Safe to run more than once; changes no existing data. Needs the
-- v-A0 to v-A3 scripts first.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.customers') IS NULL THEN
    RETURN;
  END IF;
  CREATE INDEX IF NOT EXISTS "customers_organisationId_externalId_idx" ON "customers" ("organisationId", "externalId");
  CREATE INDEX IF NOT EXISTS "customer_vehicles_externalId_idx" ON "customer_vehicles" ("externalId");
  CREATE INDEX IF NOT EXISTS "parts_externalId_idx" ON "parts" ("externalId");
  IF to_regclass('public.suppliers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "suppliers_organisationId_externalId_idx" ON "suppliers" ("organisationId", "externalId");
  END IF;
  IF to_regclass('public.historical_invoices') IS NOT NULL THEN
    ALTER TABLE "historical_invoices" ADD COLUMN IF NOT EXISTS "companyCode" TEXT;
    ALTER TABLE "historical_invoices" ADD COLUMN IF NOT EXISTS "fiscalYear" INTEGER;
    CREATE INDEX IF NOT EXISTS "historical_invoices_organisationId_invoiceNumber_idx" ON "historical_invoices" ("organisationId", "invoiceNumber");
  END IF;
END $$;
COMMIT;
