-- v-A1 Data Exchange: imports from SAP and spreadsheets (import_jobs, import_rows,
-- import_mapping_profiles) and the "made by this import" link on customers and
-- vehicles, used by Undo. New tables, columns and indexes only; re-runnable.
-- The same statements Prisma would write; the `prisma db push` that follows adds
-- the foreign keys (a safe, non-destructive change it makes on its own). The
-- manual script, scripts/v-a1-data-exchange.sql, includes them. Skipped on a brand-new database (no customers table yet:
-- db push then creates everything).
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
END $$;
