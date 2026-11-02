-- P1 Branch types: what kind of place a branch is (workshop, assembly plant,
-- sales, head office, warehouse). Every existing branch stays a WORKSHOP;
-- no plant branch is invented here — an administrator creates it under
-- Branches (or the seed does). Re-runnable; skipped on a brand-new database.
DO $$
BEGIN
  IF to_regclass('public.branches') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BranchType') THEN
    CREATE TYPE "BranchType" AS ENUM ('WORKSHOP', 'ASSEMBLY_PLANT', 'SALES', 'HEAD_OFFICE', 'WAREHOUSE');
  END IF;
  ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "type" "BranchType" NOT NULL DEFAULT 'WORKSHOP';
END
$$;
