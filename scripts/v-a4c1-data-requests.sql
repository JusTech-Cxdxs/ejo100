-- A4c1 — a customer's data request (NDPA 2023). Additive only: one new table.
CREATE TABLE IF NOT EXISTS "data_requests" (
  "id"             TEXT NOT NULL,
  "number"         TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "customerId"     TEXT NOT NULL,
  "kind"           TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'RECEIVED',
  "receivedVia"    TEXT NOT NULL,
  "receivedAt"     TIMESTAMP(3) NOT NULL,
  "details"        TEXT,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedById"   TEXT,
  "verifiedAt"     TIMESTAMP(3),
  "verifiedHow"    TEXT,
  "packAt"         TIMESTAMP(3),
  "packChecksum"   TEXT,
  "packDownloads"  INTEGER NOT NULL DEFAULT 0,
  "closedById"     TEXT,
  "closedAt"       TIMESTAMP(3),
  "outcome"        TEXT,
  CONSTRAINT "data_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "data_requests_number_key" ON "data_requests"("number");
CREATE INDEX IF NOT EXISTS "data_requests_organisationId_status_receivedAt_idx" ON "data_requests"("organisationId", "status", "receivedAt");
CREATE INDEX IF NOT EXISTS "data_requests_organisationId_customerId_idx" ON "data_requests"("organisationId", "customerId");
