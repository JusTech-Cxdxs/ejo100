-- P3 Plant demo: where a plant record came from (an import, or the demo as
-- "EJO-DEMO") and its number there, on vehicles, shipments and kits. Columns
-- and indexes only; re-runnable; skipped on a brand-new database.
DO $$
BEGIN
  IF to_regclass('public.plant_vehicles') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "plant_vehicles"  ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
  ALTER TABLE "plant_vehicles"  ADD COLUMN IF NOT EXISTS "externalId" TEXT;
  ALTER TABLE "plant_shipments" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
  ALTER TABLE "plant_shipments" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
  ALTER TABLE "plant_kits"      ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
  ALTER TABLE "plant_kits"      ADD COLUMN IF NOT EXISTS "externalId" TEXT;
  CREATE INDEX IF NOT EXISTS "plant_vehicles_organisationId_externalSource_idx"  ON "plant_vehicles"("organisationId", "externalSource");
  CREATE INDEX IF NOT EXISTS "plant_shipments_organisationId_externalSource_idx" ON "plant_shipments"("organisationId", "externalSource");
  CREATE INDEX IF NOT EXISTS "plant_kits_organisationId_externalSource_idx"      ON "plant_kits"("organisationId", "externalSource");
END $$;
