-- D1 Assembly plant and PDI, for a manual run in the Supabase SQL editor (if the
-- deploy has not applied it). Safe to run more than once; changes no existing data.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.organisations') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "sapPlant" TEXT;
  CREATE TABLE IF NOT EXISTS "plant_vehicles" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "vinKey" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "modelCode" TEXT NOT NULL,
    "modelName" TEXT,
    "engineNumber" TEXT,
    "colour" TEXT,
    "modelYear" INTEGER,
    "stage" TEXT NOT NULL DEFAULT 'PDI',
    "sapPlant" TEXT,
    "sapMaterial" TEXT,
    "sapProductionOrder" TEXT,
    "sapEquipment" TEXT,
    "customerVehicleId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plant_vehicles_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "plant_vehicles_organisationId_vinKey_key" ON "plant_vehicles" ("organisationId", "vinKey");
  CREATE INDEX IF NOT EXISTS "plant_vehicles_organisationId_stage_idx" ON "plant_vehicles" ("organisationId", "stage");
  CREATE INDEX IF NOT EXISTS "plant_vehicles_branchId_idx" ON "plant_vehicles" ("branchId");
  CREATE TABLE IF NOT EXISTS "pdi_inspections" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "plantVehicleId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "templateKey" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "odometerKm" INTEGER,
    "batteryVolts" DOUBLE PRECISION,
    "tyreFrontPsi" DOUBLE PRECISION,
    "tyreRearPsi" DOUBLE PRECISION,
    "faultScanDone" BOOLEAN NOT NULL DEFAULT false,
    "faultCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "faultCodesCleared" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "inspectorId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "sapUsageDecision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pdi_inspections_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "pdi_inspections_number_key" ON "pdi_inspections" ("number");
  CREATE INDEX IF NOT EXISTS "pdi_inspections_organisationId_status_idx" ON "pdi_inspections" ("organisationId", "status");
  CREATE INDEX IF NOT EXISTS "pdi_inspections_plantVehicleId_idx" ON "pdi_inspections" ("plantVehicleId");
  CREATE INDEX IF NOT EXISTS "pdi_inspections_branchId_status_idx" ON "pdi_inspections" ("branchId", "status");
  CREATE TABLE IF NOT EXISTS "pdi_items" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "allowNa" BOOLEAN NOT NULL DEFAULT false,
    "result" TEXT,
    "defect" TEXT,
    "reworkNote" TEXT,
    "reworkedAt" TIMESTAMP(3),
    "reworkedById" TEXT,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    CONSTRAINT "pdi_items_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "pdi_items_inspectionId_code_key" ON "pdi_items" ("inspectionId", "code");
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_vehicles_organisationId_fkey') THEN
    ALTER TABLE "plant_vehicles" ADD CONSTRAINT "plant_vehicles_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_vehicles_branchId_fkey') THEN
    ALTER TABLE "plant_vehicles" ADD CONSTRAINT "plant_vehicles_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pdi_inspections_organisationId_fkey') THEN
    ALTER TABLE "pdi_inspections" ADD CONSTRAINT "pdi_inspections_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pdi_inspections_branchId_fkey') THEN
    ALTER TABLE "pdi_inspections" ADD CONSTRAINT "pdi_inspections_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pdi_inspections_plantVehicleId_fkey') THEN
    ALTER TABLE "pdi_inspections" ADD CONSTRAINT "pdi_inspections_plantVehicleId_fkey" FOREIGN KEY ("plantVehicleId") REFERENCES "plant_vehicles" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pdi_items_inspectionId_fkey') THEN
    ALTER TABLE "pdi_items" ADD CONSTRAINT "pdi_items_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "pdi_inspections" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
COMMIT;
