-- P1 Branch types, for a manual run in the Supabase SQL editor (if the deploy
-- has not applied it). Safe to run more than once; every existing branch
-- stays a workshop. Then, under Branches, add the assembly plant as its own
-- branch (type "Assembly plant", with its SAP plant code).
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BranchType') THEN
    CREATE TYPE "BranchType" AS ENUM ('WORKSHOP', 'ASSEMBLY_PLANT', 'SALES', 'HEAD_OFFICE', 'WAREHOUSE');
  END IF;
  ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "type" "BranchType" NOT NULL DEFAULT 'WORKSHOP';
END
$$;
COMMIT;
