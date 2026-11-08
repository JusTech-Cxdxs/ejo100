-- P8 The plant's records brought in from SAP or its registers: which import
-- brought each shipment, kit, kit issue and plant vehicle in. Columns and
-- indexes only; re-runnable; skipped on a brand-new database.
DO $$
BEGIN
  IF to_regclass('public.plant_vehicles') IS NOT NULL THEN
    ALTER TABLE "plant_vehicles" ADD COLUMN IF NOT EXISTS "importJobId" TEXT;
    CREATE INDEX IF NOT EXISTS "plant_vehicles_importJobId_idx" ON "plant_vehicles"("importJobId");
  END IF;
  IF to_regclass('public.plant_shipments') IS NOT NULL THEN
    ALTER TABLE "plant_shipments" ADD COLUMN IF NOT EXISTS "importJobId" TEXT;
    CREATE INDEX IF NOT EXISTS "plant_shipments_importJobId_idx" ON "plant_shipments"("importJobId");
  END IF;
  IF to_regclass('public.plant_kits') IS NOT NULL THEN
    ALTER TABLE "plant_kits" ADD COLUMN IF NOT EXISTS "importJobId" TEXT;
    CREATE INDEX IF NOT EXISTS "plant_kits_importJobId_idx" ON "plant_kits"("importJobId");
  END IF;
  IF to_regclass('public.plant_kit_issues') IS NOT NULL THEN
    ALTER TABLE "plant_kit_issues" ADD COLUMN IF NOT EXISTS "importJobId" TEXT;
    CREATE INDEX IF NOT EXISTS "plant_kit_issues_importJobId_idx" ON "plant_kit_issues"("importJobId");
  END IF;
END $$;
