-- V1 closure: parts requests still APPROVED (stock reserved) on a job that has
-- already finished. Before this release nothing withdrew them, and the app now
-- (rightly) refuses to release parts to a finished job — so give the reserved
-- stock back and mark the request withdrawn, exactly as a cancellation does
-- from now on. Re-runnable: a second run finds nothing to do.
DO $$
BEGIN
  IF to_regclass('public.part_request_slips') IS NULL
     OR to_regclass('public.part_request_slip_lines') IS NULL
     OR to_regclass('public.part_stock') IS NULL THEN
    RETURN;
  END IF;

  -- One statement: stock is given back and the requests withdrawn together.
  WITH stale AS (
    SELECT s.id
    FROM part_request_slips s
    LEFT JOIN job_cards j ON j.id = s."jobCardId"
    LEFT JOIN vehicle_services v ON v.id = s."vehicleServiceId"
    WHERE s.status = 'APPROVED'
      AND (j.status::text IN ('CANCELLED', 'CLOSED', 'CHECKED_OUT')
           OR v.status::text IN ('CANCELLED', 'CLOSED', 'COLLECTED', 'ESCALATED'))
    FOR UPDATE OF s
  ), given_back AS (
    UPDATE part_stock ps
    SET "quantityReserved" = GREATEST(0, ps."quantityReserved" - r.qty)
    FROM (
      SELECT l."partId", SUM(l."quantityRequested") AS qty
      FROM part_request_slip_lines l
      JOIN stale x ON x.id = l."slipId"
      GROUP BY l."partId"
    ) r
    WHERE ps."partId" = r."partId"
    RETURNING ps."partId"
  )
  UPDATE part_request_slips s
  SET status = 'REJECTED',
      "rejectedAt" = now(),
      "rejectionStage" = 'WITHDRAWN',
      "rejectionReason" = 'Withdrawn automatically: the job had already finished (V1 clean-up)',
      "updatedAt" = now()
  WHERE s.id IN (SELECT id FROM stale);
END
$$;
