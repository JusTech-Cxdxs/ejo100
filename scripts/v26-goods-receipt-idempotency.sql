-- EJO 100 — v26: a resent Goods Receipt can never add stock twice.
-- Adds the optional, unique "idempotencyKey" column to goods_receipts (one key
-- per submitted form). Existing receipts keep NULL — nothing about them changes.
-- The production deploy (prisma db push) makes exactly this change on its own;
-- this script is only for applying it by hand. Safe to run more than once.
-- Run in Supabase → SQL Editor.

ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipts_idempotencyKey_key" ON "goods_receipts" ("idempotencyKey");

-- Check: the column exists and no key is used twice (expect one row, duplicates = 0).
SELECT COUNT(*) FILTER (WHERE "idempotencyKey" IS NOT NULL) AS with_key,
       COUNT("idempotencyKey") - COUNT(DISTINCT "idempotencyKey") AS duplicates
FROM "goods_receipts";
