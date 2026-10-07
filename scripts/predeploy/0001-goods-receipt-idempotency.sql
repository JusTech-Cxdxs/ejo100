-- Applied automatically before `prisma db push` on production deploys
-- (scripts/apply-predeploy-sql.js). Additive and re-runnable only.
-- v26: a resent Goods Receipt can never add stock twice. Creating the unique
-- index here first means `db push` finds nothing to change, instead of
-- stopping on its "a unique constraint will be added" warning.
-- (Skipped on a brand-new database: the push then creates everything itself.)
DO $$
BEGIN
  IF to_regclass('public.goods_receipts') IS NOT NULL THEN
    ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipts_idempotencyKey_key" ON "goods_receipts" ("idempotencyKey");
  END IF;
END $$;
