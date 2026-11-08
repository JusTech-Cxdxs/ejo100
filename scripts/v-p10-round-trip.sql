-- P10 Updates from an edited export: each row's changes ({ field, label, from,
-- to }), previewed before approval and put back by an undo. One column only;
-- re-runnable; skipped on a brand-new database.
DO $$
BEGIN
  IF to_regclass('public.import_rows') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "import_rows" ADD COLUMN IF NOT EXISTS "changes" JSONB;
END $$;
