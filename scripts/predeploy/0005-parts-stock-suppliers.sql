-- v-A2 Data Exchange: suppliers (the organisation's SAP vendors), parts made by an
-- import, opening-balance goods receipts (opening stock dated at the cut-over),
-- the receipt's link to its supplier, and Finance's sign-off on opening stock.
-- New tables, columns and indexes only; re-runnable. The `prisma db push` that
-- follows adds the foreign keys (scripts/v-a2-parts-stock-suppliers.sql, the
-- manual version, includes them). Skipped on a brand-new database.
DO $$
BEGIN
  IF to_regclass('public.parts') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "parts" ADD COLUMN IF NOT EXISTS "importJobId" TEXT;
  ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
  ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "isOpeningBalance" BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "importJobId" TEXT;
  IF to_regclass('public.import_jobs') IS NOT NULL THEN
    ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "asOf" TIMESTAMP(3);
    ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "signedOffById" TEXT;
    ALTER TABLE "import_jobs" ADD COLUMN IF NOT EXISTS "signedOffAt" TIMESTAMP(3);
  END IF;
  CREATE TABLE IF NOT EXISTS "suppliers" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "externalSource" TEXT,
    "externalId" TEXT,
    "importJobId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_organisationId_externalSource_externalId_key" ON "suppliers" ("organisationId", "externalSource", "externalId");
  CREATE INDEX IF NOT EXISTS "parts_importJobId_idx" ON "parts" ("importJobId");
  CREATE INDEX IF NOT EXISTS "goods_receipts_importJobId_idx" ON "goods_receipts" ("importJobId");
  CREATE INDEX IF NOT EXISTS "goods_receipts_supplierId_idx" ON "goods_receipts" ("supplierId");
  CREATE INDEX IF NOT EXISTS "suppliers_organisationId_name_idx" ON "suppliers" ("organisationId", "name");
  CREATE INDEX IF NOT EXISTS "suppliers_importJobId_idx" ON "suppliers" ("importJobId");
END $$;
