-- v27: Better Auth writes "updatedAt" on every verification row (password-reset
-- and set-password links). Added with a default so existing rows are valid and
-- `prisma db push` finds nothing to change. Skipped on a brand-new database.
DO $$
BEGIN
  IF to_regclass('public.verifications') IS NOT NULL THEN
    ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;
