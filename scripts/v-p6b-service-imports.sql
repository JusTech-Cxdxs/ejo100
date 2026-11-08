-- Manual version for the Supabase SQL editor: the same as scripts/predeploy/0020-service-imports.sql.
-- P6b Vehicle services open at the cut-over, and future bookings: the day and
-- time a booked customer is expected, where a service came from (SAP,
-- LEGACY), its number there and the import that loaded it. Columns and
-- indexes only; re-runnable; skipped on a brand-new database.
DO $$
BEGIN
  IF to_regclass('public.vehicle_services') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "vehicle_services" ADD COLUMN IF NOT EXISTS "bookedFor" TIMESTAMP(3);
  ALTER TABLE "vehicle_services" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
  ALTER TABLE "vehicle_services" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
  ALTER TABLE "vehicle_services" ADD COLUMN IF NOT EXISTS "importJobId" TEXT;
  CREATE INDEX IF NOT EXISTS "vehicle_services_branchId_bookedFor_idx" ON "vehicle_services"("branchId", "bookedFor");
  CREATE INDEX IF NOT EXISTS "vehicle_services_importJobId_idx" ON "vehicle_services"("importJobId");
  CREATE INDEX IF NOT EXISTS "vehicle_services_branchId_externalSource_externalId_idx" ON "vehicle_services"("branchId", "externalSource", "externalId");
END $$;
