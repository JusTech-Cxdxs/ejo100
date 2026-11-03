-- D1 Demo organisation: organisations.isDemo marks the one organisation that
-- gets demo people with sign-ins and demo records (apps/portal/lib/demo).
-- Additive and re-runnable; skipped on a brand-new database (db push creates
-- the column there).
DO $$
BEGIN
  IF to_regclass('public.organisations') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;
END $$;
