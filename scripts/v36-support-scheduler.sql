-- EJO 100 — v36: the Support centre's runs (pg_cron → portal).
--   ejo-support       every 3 minutes: new mail, targets, reminders, closing, surveys
--   ejo-support-enyo  every 2 minutes: Enyo reads new requests (answers or drafts)
--
-- Needs v25-supabase-scheduler.sql first (it stores CRON_SECRET in Supabase
-- Vault as ejo_cron_secret). Replace PASTE_YOUR_PORTAL_ADDRESS_HERE (twice)
-- with the portal's public address (NEXT_PUBLIC_PORTAL_URL, no trailing
-- slash). Safe to run more than once.

SELECT cron.unschedule('ejo-support') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ejo-support');
SELECT cron.schedule(
  'ejo-support',
  '*/3 * * * *',
  $job$
  SELECT net.http_get(
    url := 'PASTE_YOUR_PORTAL_ADDRESS_HERE/api/cron/support',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ejo_cron_secret')),
    timeout_milliseconds := 65000
  );
  $job$
);

SELECT cron.unschedule('ejo-support-enyo') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ejo-support-enyo');
SELECT cron.schedule(
  'ejo-support-enyo',
  '*/2 * * * *',
  $job$
  SELECT net.http_get(
    url := 'PASTE_YOUR_PORTAL_ADDRESS_HERE/api/cron/support?step=enyo',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ejo_cron_secret')),
    timeout_milliseconds := 65000
  );
  $job$
);

-- Check (after a few minutes): status_code 200 = working.
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'ejo-support%';
-- SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 5;
