-- v-A3 Data Exchange: SAP history. Customers get the date they became customers
-- (customerSince, SAP ERDAT); invoices from SAP before EJO 100 (historical_invoices);
-- the plant's production, QC and PDI registers (vehicle_history_records). Read-only
-- history. New tables, a column and indexes only; re-runnable. The `prisma db push`
-- that follows adds the foreign keys (scripts/v-a3-sap-history.sql, the manual
-- version, includes them). Skipped on a brand-new database.
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
END $$;
