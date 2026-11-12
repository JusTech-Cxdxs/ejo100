-- A4c3 — scheduled exports. Additive only: one new table.
CREATE TABLE IF NOT EXISTS "export_schedules" (
  "id"             TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "ownerId"        TEXT NOT NULL,
  "kind"           TEXT NOT NULL,
  "format"         TEXT NOT NULL,
  "params"         JSONB NOT NULL,
  "summary"        TEXT,
  "sensitive"      BOOLEAN NOT NULL DEFAULT false,
  "cadence"        TEXT NOT NULL,
  "dayOfWeek"      INTEGER,
  "dayOfMonth"     INTEGER,
  "status"         TEXT NOT NULL DEFAULT 'ACTIVE',
  "pausedReason"   TEXT,
  "nextRunOn"      TEXT NOT NULL,
  "lastRunAt"      TIMESTAMP(3),
  "lastExportId"   TEXT,
  "runs"           INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "export_schedules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "export_schedules_status_nextRunOn_idx" ON "export_schedules"("status", "nextRunOn");
CREATE INDEX IF NOT EXISTS "export_schedules_organisationId_ownerId_idx" ON "export_schedules"("organisationId", "ownerId");
