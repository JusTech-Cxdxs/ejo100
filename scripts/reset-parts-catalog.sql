-- Wipes the entire Part catalog — every Part, and everything that only
-- exists because of a Part (stock, batches, serials, alternative units,
-- fitment rows, Goods Receipts, Parts Requests) — so parts can be
-- re-registered from scratch under the new PartCategory/PartType model.
-- Run this once in Supabase's SQL Editor.
--
-- Deliberately does NOT touch Job Cards, Estimates, or Estimate line
-- items themselves — those are Job Card data, not Part data, and stay
-- exactly as they are. Any estimate line that had already been matched
-- to a Part being deleted here has that match cleared (matchedPartId
-- set back to null) rather than left dangling — it goes back to
-- "awaiting Store match," the same honest state it would show if Store
-- simply hadn't matched it yet.
--
-- Run inside one transaction: either all of this happens, or none of
-- it does — no risk of a partial wipe left half-done.

BEGIN;

-- 1. Clear any existing match before the Parts they point to are gone.
UPDATE estimate_line_items SET "matchedPartId" = NULL WHERE "matchedPartId" IS NOT NULL;

-- 2. PartRequestSlipLine and GoodsReceiptLine don't cascade-delete with
--    their Part (deliberately — a request or receipt is a real
--    historical record, not something that should vanish silently just
--    because the catalog changed later). Since a full reset is what's
--    being asked for here, clear these explicitly rather than let the
--    delete below fail on a foreign key violation.
DELETE FROM part_request_slip_lines;
DELETE FROM goods_receipt_lines;

-- 3. Goods Receipts and Parts Requests themselves are now empty shells
--    with nothing left to receipt or request — remove them too, rather
--    than leave orphaned header rows with zero real lines under them.
DELETE FROM goods_receipts;
DELETE FROM part_request_slips;

-- 4. Everything else that references a Part (stock, batches, serials,
--    alternative units, fitment rows) already cascades automatically —
--    deleting the Part is enough to remove all of it in one step.
DELETE FROM parts;

COMMIT;
