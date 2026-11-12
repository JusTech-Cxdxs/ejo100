-- C1a Daily postings for SAP: the files EJO writes (one branch, one kind, up to
-- a day) and their lines, each with the status SAP's return file gives it.
-- Two new tables; nothing else changes. Re-runnable.
CREATE TABLE IF NOT EXISTS "sap_posting_files" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "branchId" TEXT,
  "kind" TEXT NOT NULL,
  "upTo" DATE NOT NULL,
  "lineCount" INTEGER NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "checksum" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "downloadedAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  CONSTRAINT "sap_posting_files_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sap_posting_files_number_key" ON "sap_posting_files"("number");
CREATE INDEX IF NOT EXISTS "sap_posting_files_organisationId_branchId_kind_createdAt_idx" ON "sap_posting_files"("organisationId", "branchId", "kind", "createdAt");

CREATE TABLE IF NOT EXISTS "sap_posting_lines" (
  "id" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "ref" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "quantity" DECIMAL(18,4),
  "amount" DECIMAL(18,2),
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SENT',
  "sapDocument" TEXT,
  "message" TEXT,
  "retryOf" TEXT,
  "answeredAt" TIMESTAMP(3),
  "answeredById" TEXT,
  CONSTRAINT "sap_posting_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sap_posting_lines_fileId_lineNo_key" ON "sap_posting_lines"("fileId", "lineNo");
CREATE INDEX IF NOT EXISTS "sap_posting_lines_organisationId_ref_idx" ON "sap_posting_lines"("organisationId", "ref");
CREATE INDEX IF NOT EXISTS "sap_posting_lines_organisationId_entityType_entityId_idx" ON "sap_posting_lines"("organisationId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "sap_posting_lines_organisationId_status_idx" ON "sap_posting_lines"("organisationId", "status");
-- The link from each line to its file (ON DELETE CASCADE) is added by the schema push that follows.
