-- v-A1 Data Exchange, for a manual run in the Supabase SQL editor (if the Render
-- deploy has not applied it). Safe to run more than once; changes no existing data.
-- Needs the v-A0 script first (scripts/v-a0-optional-email-sap-keys.sql).
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.customers') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "importJobId" TEXT;
  ALTER TABLE "customer_vehicles" ADD COLUMN IF NOT EXISTS "importJobId" TEXT;
  CREATE TABLE IF NOT EXISTS "import_jobs" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "branchId" TEXT,
    "entity" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "fileRows" INTEGER NOT NULL DEFAULT 0,
    "headers" JSONB NOT NULL,
    "mapping" JSONB,
    "matchMode" TEXT NOT NULL DEFAULT 'ADD_ONLY',
    "sourceSystem" TEXT NOT NULL DEFAULT 'SAP',
    "possibleDuplicates" TEXT NOT NULL DEFAULT 'SKIP',
    "status" TEXT NOT NULL DEFAULT 'UPLOADING',
    "goodRows" INTEGER NOT NULL DEFAULT 0,
    "warningRows" INTEGER NOT NULL DEFAULT 0,
    "rejectedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "matchedRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "totals" JSONB,
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "undoneById" TEXT,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
  );
  CREATE TABLE IF NOT EXISTS "import_rows" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "cells" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "issues" JSONB,
    "keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "matchedId" TEXT,
    "matchedBy" TEXT,
    "resultId" TEXT,
    "filled" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
  );
  CREATE TABLE IF NOT EXISTS "import_mapping_profiles" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "import_mapping_profiles_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "import_jobs_number_key" ON "import_jobs" ("number");
  CREATE UNIQUE INDEX IF NOT EXISTS "import_rows_jobId_rowNumber_key" ON "import_rows" ("jobId", "rowNumber");
  CREATE UNIQUE INDEX IF NOT EXISTS "import_mapping_profiles_organisationId_entity_name_key" ON "import_mapping_profiles" ("organisationId", "entity", "name");
  CREATE INDEX IF NOT EXISTS "customers_importJobId_idx" ON "customers" ("importJobId");
  CREATE INDEX IF NOT EXISTS "customer_vehicles_importJobId_idx" ON "customer_vehicles" ("importJobId");
  CREATE INDEX IF NOT EXISTS "import_jobs_organisationId_createdAt_idx" ON "import_jobs" ("organisationId", "createdAt");
  CREATE INDEX IF NOT EXISTS "import_jobs_organisationId_entity_fileSha256_idx" ON "import_jobs" ("organisationId", "entity", "fileSha256");
  CREATE INDEX IF NOT EXISTS "import_rows_jobId_status_idx" ON "import_rows" ("jobId", "status");
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_jobs_organisationId_fkey') THEN
    ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_jobs_createdById_fkey') THEN
    ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_jobs_approvedById_fkey') THEN
    ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_rows_jobId_fkey') THEN
    ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "import_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_mapping_profiles_organisationId_fkey') THEN
    ALTER TABLE "import_mapping_profiles" ADD CONSTRAINT "import_mapping_profiles_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_mapping_profiles_createdById_fkey') THEN
    ALTER TABLE "import_mapping_profiles" ADD CONSTRAINT "import_mapping_profiles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
COMMIT;
