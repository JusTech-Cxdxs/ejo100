-- A4 Data Exchange: exports (one record per export of a list, and one per
-- person who downloaded it). New tables and indexes only; re-runnable. The
-- `prisma db push` that follows adds the foreign keys (scripts/v-a4c-export-jobs.sql,
-- the manual version, includes them). Skipped on a brand-new database.
DO $$
BEGIN
  IF to_regclass('public.organisations') IS NULL THEN
    RETURN;
  END IF;
  CREATE TABLE IF NOT EXISTS "export_jobs" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "summary" TEXT,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "rowCount" INTEGER,
    "bytes" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "export_jobs_number_key" ON "export_jobs" ("number");
  CREATE INDEX IF NOT EXISTS "export_jobs_organisationId_createdAt_idx" ON "export_jobs" ("organisationId", "createdAt");
  CREATE INDEX IF NOT EXISTS "export_jobs_createdById_createdAt_idx" ON "export_jobs" ("createdById", "createdAt");
  CREATE TABLE IF NOT EXISTS "export_downloads" (
    "id" TEXT NOT NULL,
    "exportJobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "parts" INTEGER NOT NULL DEFAULT 0,
    "resumeFrom" TEXT,
    "partFinishedAt" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "export_downloads_pkey" PRIMARY KEY ("id")
  );
  ALTER TABLE "export_downloads" ADD COLUMN IF NOT EXISTS "parts" INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE "export_downloads" ADD COLUMN IF NOT EXISTS "resumeFrom" TEXT;
  ALTER TABLE "export_downloads" ADD COLUMN IF NOT EXISTS "partFinishedAt" TIMESTAMP(3);
  CREATE UNIQUE INDEX IF NOT EXISTS "export_downloads_exportJobId_userId_key" ON "export_downloads" ("exportJobId", "userId");
END $$;
