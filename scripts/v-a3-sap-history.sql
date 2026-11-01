-- v-A3 Data Exchange (SAP history), for a manual run in the Supabase SQL editor (if
-- the Render deploy has not applied it). Safe to run more than once; changes no
-- existing data. Needs the v-A0, v-A1 and v-A2 scripts first.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.customers') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customerSince" DATE;
  IF to_regclass('public.import_jobs') IS NOT NULL THEN
    ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "defaultKind" TEXT;
  END IF;
  CREATE TABLE IF NOT EXISTS "historical_invoices" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "branchId" TEXT,
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "vin" TEXT,
    "vinKey" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "documentType" TEXT,
    "description" TEXT,
    "externalSource" TEXT NOT NULL DEFAULT 'SAP',
    "importJobId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "historical_invoices_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "historical_invoices_org_source_number_key" ON "historical_invoices" ("organisationId", "externalSource", "invoiceNumber");
  CREATE INDEX IF NOT EXISTS "historical_invoices_customerId_invoiceDate_idx" ON "historical_invoices" ("customerId", "invoiceDate");
  CREATE INDEX IF NOT EXISTS "historical_invoices_organisationId_invoiceDate_idx" ON "historical_invoices" ("organisationId", "invoiceDate");
  CREATE INDEX IF NOT EXISTS "historical_invoices_vehicleId_idx" ON "historical_invoices" ("vehicleId");
  CREATE INDEX IF NOT EXISTS "historical_invoices_vinKey_idx" ON "historical_invoices" ("vinKey");
  CREATE INDEX IF NOT EXISTS "historical_invoices_importJobId_idx" ON "historical_invoices" ("importJobId");
  CREATE TABLE IF NOT EXISTS "vehicle_history_records" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "vinKey" TEXT NOT NULL,
    "model" TEXT,
    "kind" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "stage" TEXT,
    "result" TEXT,
    "inspector" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "externalSource" TEXT NOT NULL DEFAULT 'REGISTER',
    "importJobId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vehicle_history_records_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_history_records_organisationId_dedupeKey_key" ON "vehicle_history_records" ("organisationId", "dedupeKey");
  CREATE INDEX IF NOT EXISTS "vehicle_history_records_organisationId_vinKey_idx" ON "vehicle_history_records" ("organisationId", "vinKey");
  CREATE INDEX IF NOT EXISTS "vehicle_history_records_importJobId_idx" ON "vehicle_history_records" ("importJobId");
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'historical_invoices_organisationId_fkey') THEN
    ALTER TABLE "historical_invoices" ADD CONSTRAINT "historical_invoices_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_history_records_organisationId_fkey') THEN
    ALTER TABLE "vehicle_history_records" ADD CONSTRAINT "vehicle_history_records_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
COMMIT;
