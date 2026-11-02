-- D3 Assembly line: routes (stations and checks, in versions), each
-- vehicle's station visits, defects and QA audits; the vehicle's route, its
-- current station and its line timestamps. New tables, indexes and columns
-- only; re-runnable. The `prisma db push` that follows adds the foreign keys
-- (scripts/v-d3-line.sql, the manual version, includes them). Skipped on a
-- brand-new database.
DO $$
BEGIN
  IF to_regclass('public.organisations') IS NULL OR to_regclass('public.plant_vehicles') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "plant_vehicles" ADD COLUMN IF NOT EXISTS "routeId" TEXT;
  ALTER TABLE "plant_vehicles" ADD COLUMN IF NOT EXISTS "routeVersion" INTEGER;
  ALTER TABLE "plant_vehicles" ADD COLUMN IF NOT EXISTS "currentStation" TEXT;
  ALTER TABLE "plant_vehicles" ADD COLUMN IF NOT EXISTS "lineStartedAt" TIMESTAMP(3);
  ALTER TABLE "plant_vehicles" ADD COLUMN IF NOT EXISTS "gatePassedAt" TIMESTAMP(3);
  CREATE TABLE IF NOT EXISTS "plant_routes" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "familyKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "stations" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plant_routes_pkey" PRIMARY KEY ("id")
  );
  CREATE TABLE IF NOT EXISTS "plant_station_visits" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "plantVehicleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "standardMinutes" INTEGER NOT NULL,
    "checks" JSONB NOT NULL,
    "results" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "operatorId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "passedById" TEXT,
    "passedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plant_station_visits_pkey" PRIMARY KEY ("id")
  );
  CREATE TABLE IF NOT EXISTS "plant_defects" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "plantVehicleId" TEXT NOT NULL,
    "visitId" TEXT,
    "stationCode" TEXT,
    "checkCode" TEXT,
    "location" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "raisedById" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reworkNote" TEXT,
    "reworkedById" TEXT,
    "reworkedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifyNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plant_defects_pkey" PRIMARY KEY ("id")
  );
  CREATE TABLE IF NOT EXISTS "plant_qa_audits" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "plantVehicleId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "findings" JSONB NOT NULL DEFAULT '[]',
    "demerits" INTEGER NOT NULL DEFAULT 0,
    "result" TEXT,
    "notes" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plant_qa_audits_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "plant_routes_branchId_familyKey_version_key" ON "plant_routes" ("branchId", "familyKey", "version");
  CREATE UNIQUE INDEX IF NOT EXISTS "plant_station_visits_plantVehicleId_code_key" ON "plant_station_visits" ("plantVehicleId", "code");
  CREATE UNIQUE INDEX IF NOT EXISTS "plant_defects_number_key" ON "plant_defects" ("number");
  CREATE UNIQUE INDEX IF NOT EXISTS "plant_qa_audits_number_key" ON "plant_qa_audits" ("number");
  CREATE INDEX IF NOT EXISTS "plant_routes_organisationId_familyKey_idx" ON "plant_routes" ("organisationId", "familyKey");
  CREATE INDEX IF NOT EXISTS "plant_station_visits_organisationId_status_idx" ON "plant_station_visits" ("organisationId", "status");
  CREATE INDEX IF NOT EXISTS "plant_station_visits_branchId_code_status_idx" ON "plant_station_visits" ("branchId", "code", "status");
  CREATE INDEX IF NOT EXISTS "plant_defects_organisationId_status_idx" ON "plant_defects" ("organisationId", "status");
  CREATE INDEX IF NOT EXISTS "plant_defects_plantVehicleId_idx" ON "plant_defects" ("plantVehicleId");
  CREATE INDEX IF NOT EXISTS "plant_defects_branchId_severity_status_idx" ON "plant_defects" ("branchId", "severity", "status");
  CREATE INDEX IF NOT EXISTS "plant_qa_audits_organisationId_result_idx" ON "plant_qa_audits" ("organisationId", "result");
  CREATE INDEX IF NOT EXISTS "plant_qa_audits_plantVehicleId_idx" ON "plant_qa_audits" ("plantVehicleId");
END
$$;
