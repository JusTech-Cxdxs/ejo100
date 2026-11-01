-- D2 Assembly plant: kit arrival and quality control. Shipments of kits, each
-- kit's arrival checks, and its shortages and damage. New tables and indexes
-- only; re-runnable. The `prisma db push` that follows adds the foreign keys
-- (scripts/v-d2-plant-kits.sql, the manual version, includes them). Skipped on
-- a brand-new database.
DO $$
BEGIN
  IF to_regclass('public.organisations') IS NULL OR to_regclass('public.plant_vehicles') IS NULL THEN
    RETURN;
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
END
$$;
