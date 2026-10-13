-- Wipes the whole part catalogue: every Part and everything that exists only
-- because of one (stock, batches, serials, alternative units, fitment rows,
-- goods receipts, parts requests), so parts can be registered again under
-- the PartCategory/PartType model. Run once in the Supabase SQL Editor.
--
-- Job Cards, estimates and estimate lines are kept. Lines matched to a
-- deleted part have matchedPartId cleared, so they show as awaiting Store
-- matching.
--
-- One transaction: all of it happens, or none of it.

BEGIN;

-- 1. Clear any existing match before the Parts they point to are gone.
UPDATE estimate_line_items SET "matchedPartId" = NULL WHERE "matchedPartId" IS NOT NULL;

-- 2. PartRequestSlipLine and GoodsReceiptLine don't cascade with their Part
--    (they are historical records). A full reset clears them explicitly so
--    the delete below doesn't fail on a foreign key.
DELETE FROM part_request_slip_lines;
DELETE FROM goods_receipt_lines;

-- 3. Goods receipts and parts requests are now empty headers; remove them.
DELETE FROM goods_receipts;
DELETE FROM part_request_slips;

-- 4. Everything else that references a Part (stock, batches, serials,
--    alternative units, fitment rows) already cascades automatically —
--    deleting the Part is enough to remove all of it in one step.
DELETE FROM parts;

COMMIT;
