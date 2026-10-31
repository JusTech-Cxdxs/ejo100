-- v-A0, the whole change for a manual run in the Supabase SQL editor (if the
-- Render deploy has not applied it). Safe to run more than once; changes no
-- existing data. 1) customers.email becomes optional (still unique when
-- present); 2) numbers from other systems on customers, vehicles and parts.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    ALTER TABLE "customers" ALTER COLUMN "email" DROP NOT NULL;
  END IF;
END $$;
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
COMMIT;
