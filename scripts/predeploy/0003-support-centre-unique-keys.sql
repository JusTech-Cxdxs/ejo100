-- Applied automatically before `prisma db push` on production deploys
-- (scripts/apply-predeploy-sql.js). Additive and re-runnable only.
-- v36 (Support centre): two new optional columns carry UNIQUE indexes —
-- a support request's private link token, and the exactly-once intake key of
-- an emailed reply. Both are new and empty, but `db push` cannot prove that and
-- stops the deploy ("a unique constraint will be added"). Creating them here
-- first leaves the push nothing to refuse. Skipped on a brand-new database.
DO $$
BEGIN
  IF to_regclass('public.support_tickets') IS NOT NULL THEN
    ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "token" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "support_tickets_token_key" ON "support_tickets" ("token");
  END IF;
  IF to_regclass('public.support_replies') IS NOT NULL THEN
    ALTER TABLE "support_replies" ADD COLUMN IF NOT EXISTS "intakeKey" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "support_replies_intakeKey_key" ON "support_replies" ("intakeKey");
  END IF;
END $$;
