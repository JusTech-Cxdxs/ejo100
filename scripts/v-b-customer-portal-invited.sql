-- B Portal invitations for imported customers: when each was invited from
-- their import (once). One nullable column only; re-runnable; skipped on a
-- brand-new database.
DO $$
BEGIN
  IF to_regclass('public.customers') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "portalInvitedAt" TIMESTAMP(3);
END $$;
