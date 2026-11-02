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
