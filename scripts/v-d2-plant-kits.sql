-- D2 Assembly plant: kit arrival and QC, for a manual run in the Supabase SQL
-- editor (if the deploy has not applied it). Needs D1 (scripts/v-d1-plant-pdi.sql)
-- first. Safe to run more than once; changes no existing data.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.organisations') IS NULL OR to_regclass('public.plant_vehicles') IS NULL THEN
    RAISE EXCEPTION 'Run scripts/v-d1-plant-pdi.sql first: the plant tables from D1 are missing.';
  END IF;
  CREATE TABLE IF NOT EXISTS "plant_shipments" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "origin" TEXT,
    "billOfLading" TEXT,
    "vessel" TEXT,
    "containers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "arrivedAt" TIMESTAMP(3) NOT NULL,
    "sapPurchaseOrder" TEXT,
    "sapInboundDelivery" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plant_shipments_pkey" PRIMARY KEY ("id")
  );
  CREATE TABLE IF NOT EXISTS "plant_kits" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "vinKey" TEXT NOT NULL,
    "engineNumber" TEXT,
    "modelCode" TEXT NOT NULL,
    "lotNumber" TEXT,
    "kitType" TEXT NOT NULL,
    "casesExpected" INTEGER,
    "casesReceived" INTEGER,
    "templateKey" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ARRIVED',
    "inspectorId" TEXT,
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "releasedWithShortages" BOOLEAN NOT NULL DEFAULT false,
    "sapUsageDecision" TEXT,
    "sapInspectionLot" TEXT,
    "sapMaterialDocument" TEXT,
    "notes" TEXT,
    "plantVehicleId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plant_kits_pkey" PRIMARY KEY ("id")
  );
  CREATE TABLE IF NOT EXISTS "plant_kit_checks" (
    "id" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "allowNa" BOOLEAN NOT NULL DEFAULT false,
    "result" TEXT,
    "note" TEXT,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    CONSTRAINT "plant_kit_checks_pkey" PRIMARY KEY ("id")
  );
  CREATE TABLE IF NOT EXISTS "plant_kit_issues" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "partNumber" TEXT,
    "description" TEXT NOT NULL,
    "caseNumber" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "stopsLine" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "claimReference" TEXT,
    "resolution" TEXT,
    "raisedById" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "plant_kit_issues_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "plant_shipments_number_key" ON "plant_shipments" ("number");
  CREATE UNIQUE INDEX IF NOT EXISTS "plant_kits_number_key" ON "plant_kits" ("number");
  CREATE UNIQUE INDEX IF NOT EXISTS "plant_kit_checks_kitId_code_key" ON "plant_kit_checks" ("kitId", "code");
  CREATE INDEX IF NOT EXISTS "plant_shipments_organisationId_arrivedAt_idx" ON "plant_shipments" ("organisationId", "arrivedAt");
  CREATE INDEX IF NOT EXISTS "plant_shipments_branchId_idx" ON "plant_shipments" ("branchId");
  CREATE INDEX IF NOT EXISTS "plant_kits_organisationId_status_idx" ON "plant_kits" ("organisationId", "status");
  CREATE INDEX IF NOT EXISTS "plant_kits_organisationId_vinKey_idx" ON "plant_kits" ("organisationId", "vinKey");
  CREATE INDEX IF NOT EXISTS "plant_kits_shipmentId_idx" ON "plant_kits" ("shipmentId");
  CREATE INDEX IF NOT EXISTS "plant_kits_branchId_status_idx" ON "plant_kits" ("branchId", "status");
  CREATE INDEX IF NOT EXISTS "plant_kit_issues_kitId_idx" ON "plant_kit_issues" ("kitId");
  CREATE INDEX IF NOT EXISTS "plant_kit_issues_organisationId_status_idx" ON "plant_kit_issues" ("organisationId", "status");
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_shipments_organisationId_fkey') THEN
    ALTER TABLE "plant_shipments" ADD CONSTRAINT "plant_shipments_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_shipments_branchId_fkey') THEN
    ALTER TABLE "plant_shipments" ADD CONSTRAINT "plant_shipments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_kits_organisationId_fkey') THEN
    ALTER TABLE "plant_kits" ADD CONSTRAINT "plant_kits_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_kits_branchId_fkey') THEN
    ALTER TABLE "plant_kits" ADD CONSTRAINT "plant_kits_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_kits_shipmentId_fkey') THEN
    ALTER TABLE "plant_kits" ADD CONSTRAINT "plant_kits_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "plant_shipments" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_kits_plantVehicleId_fkey') THEN
    ALTER TABLE "plant_kits" ADD CONSTRAINT "plant_kits_plantVehicleId_fkey" FOREIGN KEY ("plantVehicleId") REFERENCES "plant_vehicles" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_kit_checks_kitId_fkey') THEN
    ALTER TABLE "plant_kit_checks" ADD CONSTRAINT "plant_kit_checks_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "plant_kits" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_kit_issues_kitId_fkey') THEN
    ALTER TABLE "plant_kit_issues" ADD CONSTRAINT "plant_kit_issues_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "plant_kits" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
COMMIT;
