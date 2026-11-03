-- EJO 100 — one script for the Supabase SQL editor (2 Nov 2026).
-- Everything the deploys since P1 should have applied, re-runnable (nothing is dropped, nothing is deleted):
--   1. branch kinds and the plant columns (P1), the line tables (D3), the plant demo columns (P3),
--      the job card history table (P4), the open job card columns (P5);
--   2. the plant roles (plant manager, PDI, kit, quality, line);
--   3. the Afprint Assembly Plant branch for every organisation that has none yet — opened whether or not
--      plant records exist, with its departments; plant records and plant-only staff moved onto it;
--   4. a listing at the end so you can see every branch with its kind.
-- Run it as one piece. Then sign out of the portal and sign in again.


-- ───────────────────────────── scripts/v-p1-branch-types.sql ─────────────────────────────
-- P1 Branch types, for a manual run in the Supabase SQL editor (if the deploy
-- has not applied it). Safe to run more than once; every existing branch
-- stays a workshop. The second part opens the assembly plant as its own branch
-- and moves the plant's records and people onto it (see
-- scripts/postdeploy/0011-afprint-plant.sql).
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BranchType') THEN
    CREATE TYPE "BranchType" AS ENUM ('WORKSHOP', 'ASSEMBLY_PLANT', 'SALES', 'HEAD_OFFICE', 'WAREHOUSE');
  END IF;
  ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "type" "BranchType" NOT NULL DEFAULT 'WORKSHOP';
END
$$;

-- The assembly plant as its own branch, with its records and people (postdeploy 0011).
DO $$
DECLARE
  rec record; plant text; dept_id text; moved_v int; moved_k int; moved_s int; moved_p int; moved_u int;
BEGIN
  IF to_regclass('public.plant_vehicles') IS NULL OR to_regclass('public.plant_kits') IS NULL THEN
    RETURN;
  END IF;
  FOR rec IN
    SELECT b."businessUnitId", b."cityId", b.id AS from_branch, bu."organisationId"
    FROM branches b
    JOIN business_units bu ON bu.id = b."businessUnitId"
    WHERE b.type <> 'ASSEMBLY_PLANT'
      AND (EXISTS (SELECT 1 FROM plant_vehicles v WHERE v."branchId" = b.id)
        OR EXISTS (SELECT 1 FROM plant_kits k WHERE k."branchId" = b.id)
        OR EXISTS (SELECT 1 FROM pdi_inspections p WHERE p."branchId" = b.id)
        OR EXISTS (SELECT 1 FROM users u JOIN user_roles ur ON ur."userId" = u.id JOIN roles r ON r.id = ur."roleId"
                   WHERE u."branchId" = b.id AND r.slug IN ('plant-manager', 'pdi-inspector', 'pdi-supervisor', 'kit-inspector', 'quality-supervisor')))
      AND NOT EXISTS (SELECT 1 FROM branches x JOIN business_units xu ON xu.id = x."businessUnitId" WHERE xu."organisationId" = bu."organisationId" AND x.type = 'ASSEMBLY_PLANT')
    ORDER BY b."createdAt"
  LOOP
    -- One plant per organisation: a second stranded branch of the same organisation reuses it.
    SELECT x.id INTO plant FROM branches x JOIN business_units xu ON xu.id = x."businessUnitId" WHERE xu."organisationId" = rec."organisationId" AND x.type = 'ASSEMBLY_PLANT' LIMIT 1;
    IF plant IS NULL THEN
      plant := rec."businessUnitId" || '-afprint-seed';
      INSERT INTO branches (id, "businessUnitId", "cityId", name, code, type, "sapPlant", "isActive", hotlines, "createdAt", "updatedAt")
        VALUES (plant, rec."businessUnitId", rec."cityId", 'Afprint Assembly Plant', 'KWL-AP', 'ASSEMBLY_PLANT', '1100', true, '{}', now(), now())
        ON CONFLICT (id) DO UPDATE SET type = 'ASSEMBLY_PLANT', "sapPlant" = COALESCE(branches."sapPlant", '1100');
      INSERT INTO departments (id, "branchId", name, slug, "isActive", "createdAt", "updatedAt")
        SELECT gen_random_uuid()::text, plant, d.name, d.slug, true, now(), now() FROM (VALUES
          ('Kit receiving & plant store', 'plant-kit-receiving'), ('Production (the line)', 'plant-production'), ('Quality (QC and QA audit)', 'plant-quality'),
          ('PDI', 'plant-pdi'), ('Yard & dispatch', 'plant-yard'), ('Plant maintenance', 'plant-maintenance')) AS d(name, slug)
        ON CONFLICT ("branchId", slug) DO NOTHING;
    END IF;
    UPDATE plant_vehicles SET "branchId" = plant, "sapPlant" = (SELECT "sapPlant" FROM branches WHERE id = plant) WHERE "branchId" = rec.from_branch; GET DIAGNOSTICS moved_v = ROW_COUNT;
    UPDATE plant_kits SET "branchId" = plant WHERE "branchId" = rec.from_branch; GET DIAGNOSTICS moved_k = ROW_COUNT;
    UPDATE plant_shipments SET "branchId" = plant WHERE "branchId" = rec.from_branch; GET DIAGNOSTICS moved_s = ROW_COUNT;
    UPDATE pdi_inspections SET "branchId" = plant WHERE "branchId" = rec.from_branch; GET DIAGNOSTICS moved_p = ROW_COUNT;
    -- People with plant roles only (never someone who also works in the workshop or runs the organisation).
    UPDATE users u SET "branchId" = plant,
      "departmentId" = (SELECT d.id FROM departments d WHERE d."branchId" = plant AND d.slug = CASE
        WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.slug IN ('pdi-inspector', 'pdi-supervisor')) THEN 'plant-pdi'
        WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.slug = 'kit-inspector') THEN 'plant-kit-receiving'
        WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.slug = 'quality-supervisor') THEN 'plant-quality'
        ELSE 'plant-production' END)
      WHERE u."branchId" = rec.from_branch
        AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.slug IN ('plant-manager', 'pdi-inspector', 'pdi-supervisor', 'kit-inspector', 'quality-supervisor'))
        AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.slug NOT IN ('plant-manager', 'pdi-inspector', 'pdi-supervisor', 'kit-inspector', 'quality-supervisor'));
    GET DIAGNOSTICS moved_u = ROW_COUNT;
    INSERT INTO audit_logs (id, "organisationId", "userId", action, "entityType", "entityId", metadata, "createdAt")
      VALUES (gen_random_uuid()::text, rec."organisationId", NULL, 'branch.plant_records_moved', 'Branch', plant,
        jsonb_build_object('from', (SELECT name FROM branches WHERE id = rec.from_branch), 'to', 'Afprint Assembly Plant', 'sapPlant', '1100', 'by', 'deploy',
          'vehicles', moved_v, 'kits', moved_k, 'shipments', moved_s, 'pdis', moved_p, 'people', moved_u), now());
  END LOOP;
END
$$;
COMMIT;

-- ───────────────────────────── scripts/v-d3-line.sql ─────────────────────────────
-- D3 Assembly line, for a manual run in the Supabase SQL editor (if the deploy
-- has not applied it). Needs D1 and D2 first. Safe to run more than once;
-- changes no existing data.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.plant_vehicles') IS NULL OR to_regclass('public.plant_kits') IS NULL THEN
    RAISE EXCEPTION 'Run scripts/v-d1-plant-pdi.sql and scripts/v-d2-plant-kits.sql first.';
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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_routes_organisationId_fkey') THEN
    ALTER TABLE "plant_routes" ADD CONSTRAINT "plant_routes_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_routes_branchId_fkey') THEN
    ALTER TABLE "plant_routes" ADD CONSTRAINT "plant_routes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_station_visits_organisationId_fkey') THEN
    ALTER TABLE "plant_station_visits" ADD CONSTRAINT "plant_station_visits_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_station_visits_branchId_fkey') THEN
    ALTER TABLE "plant_station_visits" ADD CONSTRAINT "plant_station_visits_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_station_visits_plantVehicleId_fkey') THEN
    ALTER TABLE "plant_station_visits" ADD CONSTRAINT "plant_station_visits_plantVehicleId_fkey" FOREIGN KEY ("plantVehicleId") REFERENCES "plant_vehicles" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_defects_organisationId_fkey') THEN
    ALTER TABLE "plant_defects" ADD CONSTRAINT "plant_defects_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_defects_branchId_fkey') THEN
    ALTER TABLE "plant_defects" ADD CONSTRAINT "plant_defects_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_defects_plantVehicleId_fkey') THEN
    ALTER TABLE "plant_defects" ADD CONSTRAINT "plant_defects_plantVehicleId_fkey" FOREIGN KEY ("plantVehicleId") REFERENCES "plant_vehicles" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_defects_visitId_fkey') THEN
    ALTER TABLE "plant_defects" ADD CONSTRAINT "plant_defects_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "plant_station_visits" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_qa_audits_organisationId_fkey') THEN
    ALTER TABLE "plant_qa_audits" ADD CONSTRAINT "plant_qa_audits_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_qa_audits_branchId_fkey') THEN
    ALTER TABLE "plant_qa_audits" ADD CONSTRAINT "plant_qa_audits_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_qa_audits_plantVehicleId_fkey') THEN
    ALTER TABLE "plant_qa_audits" ADD CONSTRAINT "plant_qa_audits_plantVehicleId_fkey" FOREIGN KEY ("plantVehicleId") REFERENCES "plant_vehicles" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_vehicles_routeId_fkey') THEN
    ALTER TABLE "plant_vehicles" ADD CONSTRAINT "plant_vehicles_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "plant_routes" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
COMMIT;

-- ───────────────────────────── scripts/v-p3-plant-demo.sql ─────────────────────────────
-- Manual version for the Supabase SQL editor: the same as scripts/predeploy/0014-plant-external-ids.sql.
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

-- ───────────────────────────── scripts/v-p4-job-history.sql ─────────────────────────────
-- Manual version for the Supabase SQL editor: scripts/predeploy/0015-job-history.sql plus the foreign key db push would add.
-- P4 Job and service history from SAP (before EJO): one read-only row per
-- past job card or routine service. New table and indexes only;
-- re-runnable. The `prisma db push` that follows adds the foreign key
-- (scripts/v-p4-job-history.sql, the manual version, includes it). Skipped
-- on a brand-new database.
DO $$
BEGIN
  IF to_regclass('public.organisations') IS NULL THEN
    RETURN;
  END IF;
  CREATE TABLE IF NOT EXISTS "historical_jobs" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "branchId" TEXT,
  "customerId" TEXT NOT NULL,
  "vehicleId" TEXT,
  "vin" TEXT,
  "vinKey" TEXT,
  "plateNumber" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'JOB_CARD',
  "jobNumber" TEXT NOT NULL,
  "notificationNumber" TEXT,
  "invoiceNumber" TEXT,
  "equipmentNumber" TEXT,
  "orderType" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "mileage" INTEGER,
  "description" TEXT,
  "workDone" TEXT,
  "technician" TEXT,
  "workCentre" TEXT,
  "labourAmount" DECIMAL(65,30),
  "partsAmount" DECIMAL(65,30),
  "totalAmount" DECIMAL(65,30),
  "status" TEXT NOT NULL DEFAULT 'CLOSED',
  "externalSource" TEXT NOT NULL DEFAULT 'SAP',
  "importJobId" TEXT,
  "attendedAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "historical_jobs_pkey" PRIMARY KEY ("id")
);
  CREATE UNIQUE INDEX IF NOT EXISTS "historical_jobs_org_source_number_key" ON "historical_jobs" ("organisationId", "externalSource", "jobNumber");
  CREATE INDEX IF NOT EXISTS "historical_jobs_customerId_openedAt_idx" ON "historical_jobs" ("customerId", "openedAt");
  CREATE INDEX IF NOT EXISTS "historical_jobs_organisationId_openedAt_idx" ON "historical_jobs" ("organisationId", "openedAt");
  CREATE INDEX IF NOT EXISTS "historical_jobs_organisationId_jobNumber_idx" ON "historical_jobs" ("organisationId", "jobNumber");
  CREATE INDEX IF NOT EXISTS "historical_jobs_vehicleId_completedAt_idx" ON "historical_jobs" ("vehicleId", "completedAt");
  CREATE INDEX IF NOT EXISTS "historical_jobs_vinKey_idx" ON "historical_jobs" ("vinKey");
  CREATE INDEX IF NOT EXISTS "historical_jobs_importJobId_idx" ON "historical_jobs" ("importJobId");
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'historical_jobs_organisationId_fkey') THEN
    ALTER TABLE "historical_jobs" ADD CONSTRAINT "historical_jobs_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ───────────────────────────── scripts/v-p5-open-job-cards.sql ─────────────────────────────
-- Manual version for the Supabase SQL editor: the same as scripts/predeploy/0016-open-job-cards.sql.
-- P5 Open job cards brought in at the cut-over: where a job card came from
-- (SAP, LEGACY), its number there and the import that loaded it. Columns and
-- indexes only; re-runnable; skipped on a brand-new database.
DO $$
BEGIN
  IF to_regclass('public.job_cards') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "job_cards" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
  ALTER TABLE "job_cards" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
  ALTER TABLE "job_cards" ADD COLUMN IF NOT EXISTS "importJobId" TEXT;
  CREATE INDEX IF NOT EXISTS "job_cards_importJobId_idx" ON "job_cards"("importJobId");
  CREATE INDEX IF NOT EXISTS "job_cards_branchId_externalSource_externalId_idx" ON "job_cards"("branchId", "externalSource", "externalId");
END $$;

-- ───────────────────────────── scripts/postdeploy/0009-plant-roles.sql ─────────────────────────────
-- D1 Assembly plant: the Plant Manager, PDI Supervisor and PDI Inspector roles
-- exist for every organisation. Adds the roles only where they are missing;
-- existing roles and the people in them are never changed. Re-runnable.
INSERT INTO "roles" ("id", "organisationId", "name", "slug", "description", "isSystem", "isSuperAdmin")
SELECT gen_random_uuid()::text, o."id", r.name, r.slug, r.description, true, false
FROM "organisations" o
CROSS JOIN (VALUES
  ('Plant Manager', 'plant-manager', 'Runs the assembly plant: vehicles from kit to yard, their SAP numbers, and approves pre-delivery inspections (never their own).'),
  ('PDI Supervisor', 'pdi-supervisor', 'Leads the PDI bay: inspects, and approves or rejects colleagues'' inspections (never their own).'),
  ('PDI Inspector', 'pdi-inspector', 'Carries out pre-delivery inspections: checklist, fault codes, readings and rechecks after rework.')
) AS r(name, slug, description)
ON CONFLICT ("organisationId", "slug") DO NOTHING;

-- ───────────────────────────── scripts/postdeploy/0010-plant-kit-roles.sql ─────────────────────────────
-- D2 Assembly plant: the Quality Supervisor and Kit Inspector roles exist for
-- every organisation. Adds the roles only where they are missing; existing
-- roles and the people in them are never changed. Re-runnable.
INSERT INTO "roles" ("id", "organisationId", "name", "slug", "description", "isSystem", "isSuperAdmin")
SELECT gen_random_uuid()::text, o."id", r.name, r.slug, r.description, true, false
FROM "organisations" o
CROSS JOIN (VALUES
  ('Quality Supervisor', 'quality-supervisor', 'Leads quality at the plant: releases arriving kits to the line, holds or rejects them (never one they checked), and follows shortages to their supplier claims.'),
  ('Kit Inspector', 'kit-inspector', 'Receives kits at the plant: records each shipment, checks every kit against the packing list, and raises shortages, damage, wrong parts and excess.')
) AS r(name, slug, description)
ON CONFLICT ("organisationId", "slug") DO NOTHING;

-- ───────────────────────────── scripts/postdeploy/0012-plant-line-roles.sql ─────────────────────────────
-- D3 Assembly line: the Production Supervisor, Line Operator, QC Inspector and
-- QA Auditor roles exist for every organisation. Adds the roles only where
-- they are missing; existing roles and the people in them are never changed.
INSERT INTO "roles" ("id", "organisationId", "name", "slug", "description", "isSystem", "isSuperAdmin")
SELECT gen_random_uuid()::text, o."id", r.name, r.slug, r.description, true, false
FROM "organisations" o
CROSS JOIN (VALUES
  ('Production Supervisor', 'production-supervisor', 'Runs the line: every vehicle at its station, each station''s checks and times, defects and rework; edits the routes.'),
  ('Line Operator', 'line-operator', 'Builds at a station: records its checks and times, raises defects and records rework.'),
  ('QC Inspector', 'qc-inspector', 'Quality on the line: end-of-line tests, the final gate and defect verification (never a check they recorded).'),
  ('QA Auditor', 'qa-auditor', 'The daily QA audit: a sample of finished vehicles re-inspected and scored.')
) AS r(name, slug, description)
ON CONFLICT ("organisationId", "slug") DO NOTHING;

-- ───────────────────────────── Open the Afprint Assembly Plant where there is none ─────────────────────────────
DO $$
DECLARE
  rec record; plant text; moved_v int; moved_k int; moved_s int; moved_p int; moved_u int;
BEGIN
  FOR rec IN
    -- Every organisation with a branch but no assembly plant: its oldest workshop branch (or oldest branch) is where the plant sits.
    SELECT DISTINCT ON (bu."organisationId") b."businessUnitId", b."cityId", b.id AS from_branch, bu."organisationId", b.name AS from_name
    FROM branches b
    JOIN business_units bu ON bu.id = b."businessUnitId"
    WHERE b.type <> 'ASSEMBLY_PLANT'
      AND NOT EXISTS (SELECT 1 FROM branches x JOIN business_units xu ON xu.id = x."businessUnitId" WHERE xu."organisationId" = bu."organisationId" AND x.type = 'ASSEMBLY_PLANT')
    ORDER BY bu."organisationId", (b.type = 'WORKSHOP') DESC, b."createdAt"
  LOOP
    plant := rec."businessUnitId" || '-afprint-seed';
    INSERT INTO branches (id, "businessUnitId", "cityId", name, code, type, "sapPlant", "isActive", hotlines, "createdAt", "updatedAt")
      VALUES (plant, rec."businessUnitId", rec."cityId", 'Afprint Assembly Plant', 'KWL-AP', 'ASSEMBLY_PLANT', '1100', true, '{}', now(), now())
      ON CONFLICT (id) DO UPDATE SET type = 'ASSEMBLY_PLANT', "sapPlant" = COALESCE(branches."sapPlant", '1100'), "isActive" = true;
    INSERT INTO departments (id, "branchId", name, slug, "isActive", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, plant, d.name, d.slug, true, now(), now() FROM (VALUES
        ('Kit receiving & plant store', 'plant-kit-receiving'), ('Production (the line)', 'plant-production'), ('Quality (QC and QA audit)', 'plant-quality'),
        ('PDI', 'plant-pdi'), ('Yard & dispatch', 'plant-yard'), ('Plant maintenance', 'plant-maintenance')) AS d(name, slug)
      ON CONFLICT ("branchId", slug) DO NOTHING;
    UPDATE plant_vehicles SET "branchId" = plant, "sapPlant" = '1100' WHERE "branchId" IN (SELECT x.id FROM branches x JOIN business_units xu ON xu.id = x."businessUnitId" WHERE xu."organisationId" = rec."organisationId" AND x.type <> 'ASSEMBLY_PLANT'); GET DIAGNOSTICS moved_v = ROW_COUNT;
    UPDATE plant_kits SET "branchId" = plant WHERE "branchId" IN (SELECT x.id FROM branches x JOIN business_units xu ON xu.id = x."businessUnitId" WHERE xu."organisationId" = rec."organisationId" AND x.type <> 'ASSEMBLY_PLANT'); GET DIAGNOSTICS moved_k = ROW_COUNT;
    UPDATE plant_shipments SET "branchId" = plant WHERE "branchId" IN (SELECT x.id FROM branches x JOIN business_units xu ON xu.id = x."businessUnitId" WHERE xu."organisationId" = rec."organisationId" AND x.type <> 'ASSEMBLY_PLANT'); GET DIAGNOSTICS moved_s = ROW_COUNT;
    UPDATE pdi_inspections SET "branchId" = plant WHERE "branchId" IN (SELECT x.id FROM branches x JOIN business_units xu ON xu.id = x."businessUnitId" WHERE xu."organisationId" = rec."organisationId" AND x.type <> 'ASSEMBLY_PLANT'); GET DIAGNOSTICS moved_p = ROW_COUNT;
    UPDATE users u SET "branchId" = plant,
      "departmentId" = (SELECT d.id FROM departments d WHERE d."branchId" = plant AND d.slug = CASE
        WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.slug IN ('pdi-inspector', 'pdi-supervisor')) THEN 'plant-pdi'
        WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.slug = 'kit-inspector') THEN 'plant-kit-receiving'
        WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.slug IN ('quality-supervisor', 'qc-inspector', 'qa-auditor')) THEN 'plant-quality'
        ELSE 'plant-production' END)
      WHERE u."organisationId" = rec."organisationId" AND (u."branchId" IS NULL OR u."branchId" <> plant)
        AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.slug IN ('plant-manager', 'pdi-inspector', 'pdi-supervisor', 'kit-inspector', 'quality-supervisor', 'production-supervisor', 'line-operator', 'qc-inspector', 'qa-auditor'))
        AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.slug NOT IN ('plant-manager', 'pdi-inspector', 'pdi-supervisor', 'kit-inspector', 'quality-supervisor', 'production-supervisor', 'line-operator', 'qc-inspector', 'qa-auditor'));
    GET DIAGNOSTICS moved_u = ROW_COUNT;
    INSERT INTO audit_logs (id, "organisationId", "userId", action, "entityType", "entityId", metadata, "createdAt")
      VALUES (gen_random_uuid()::text, rec."organisationId", NULL, 'branch.plant_records_moved', 'Branch', plant,
        jsonb_build_object('from', rec.from_name, 'to', 'Afprint Assembly Plant', 'sapPlant', '1100', 'by', 'sql editor',
          'vehicles', moved_v, 'kits', moved_k, 'shipments', moved_s, 'pdis', moved_p, 'people', moved_u), now());
  END LOOP;
END
$$;

-- ───────────────────────────── What you have now ─────────────────────────────
SELECT o.name AS organisation, bu.name AS business_unit, b.name AS branch, b.type AS kind, b."sapPlant" AS sap_plant, b."isActive" AS active,
       (SELECT count(*) FROM departments d WHERE d."branchId" = b.id) AS departments,
       (SELECT count(*) FROM users u WHERE u."branchId" = b.id) AS people
FROM branches b
JOIN business_units bu ON bu.id = b."businessUnitId"
JOIN organisations o ON o.id = bu."organisationId"
ORDER BY o.name, b.type, b.name;
