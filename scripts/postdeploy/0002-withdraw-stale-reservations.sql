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

  DROP TABLE IF EXISTS _stale_slips;
  CREATE TEMP TABLE _stale_slips ON COMMIT DROP AS
  SELECT s.id
  FROM part_request_slips s
  LEFT JOIN job_cards j ON j.id = s."jobCardId"
  LEFT JOIN vehicle_services v ON v.id = s."vehicleServiceId"
  WHERE s.status = 'APPROVED'
    AND (j.status::text IN ('CANCELLED', 'CLOSED', 'CHECKED_OUT')
         OR v.status::text IN ('CANCELLED', 'CLOSED', 'COLLECTED', 'ESCALATED'))
  FOR UPDATE OF s;

  IF NOT EXISTS (SELECT 1 FROM _stale_slips) THEN
    RETURN;
  END IF;

  -- Stock first (from the lines), then the requests.
  UPDATE part_stock ps
  SET "quantityReserved" = GREATEST(0, ps."quantityReserved" - r.qty)
  FROM (
    SELECT l."partId", SUM(l."quantityRequested") AS qty
    FROM part_request_slip_lines l
    JOIN _stale_slips x ON x.id = l."slipId"
    GROUP BY l."partId"
  ) r
  WHERE ps."partId" = r."partId";

  UPDATE part_request_slips s
  SET status = 'REJECTED',
      "rejectedAt" = now(),
      "rejectionStage" = 'WITHDRAWN',
      "rejectionReason" = 'Withdrawn automatically: the job had already finished (V1 clean-up)',
      "updatedAt" = now()
  FROM _stale_slips x
  WHERE s.id = x.id;
END
$$;
