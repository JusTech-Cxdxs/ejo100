-- Manual version for the Supabase SQL editor: scripts/predeploy/0018-demo-records.sql
-- (D2 the workshop demo). Re-runnable. The demo records themselves are made by
-- the production build (DEMO_STAFF_PASSWORD set) or `npm run demo:reset`.
CREATE TABLE IF NOT EXISTS "demo_records" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "demo_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "demo_records_model_recordId_key" ON "demo_records"("model", "recordId");
CREATE INDEX IF NOT EXISTS "demo_records_organisationId_model_idx" ON "demo_records"("organisationId", "model");
ALTER TABLE "demo_records" ENABLE ROW LEVEL SECURITY;
