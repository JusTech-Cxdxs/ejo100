-- v-A0: numbers from other systems (SAP, old spreadsheets) on customers,
-- vehicles and parts, so an import matched on them never creates the same
-- record twice. New, optional columns and their indexes only; re-runnable.
-- (Making customers.email optional is done by `prisma db push` itself: it
-- relaxes a NOT NULL and loses nothing. For a manual run of the whole change
-- in the Supabase SQL editor, use scripts/v-a0-optional-email-sap-keys.sql.)
-- Skipped on a brand-new database (the tables do not exist yet).
DO $$
BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
    ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "customers_organisationId_externalSource_externalId_key" ON "customers"("organisationId", "externalSource", "externalId");
  END IF;
  IF to_regclass('public.customer_vehicles') IS NOT NULL THEN
    ALTER TABLE "customer_vehicles" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
    ALTER TABLE "customer_vehicles" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
    CREATE INDEX IF NOT EXISTS "customer_vehicles_externalSource_externalId_idx" ON "customer_vehicles"("externalSource", "externalId");
  END IF;
  IF to_regclass('public.parts') IS NOT NULL THEN
    ALTER TABLE "parts" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
    ALTER TABLE "parts" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "parts_branchId_externalSource_externalId_key" ON "parts"("branchId", "externalSource", "externalId");
  END IF;
END $$;
