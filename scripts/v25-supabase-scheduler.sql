-- EJO 100 — v25: the 10-minute scheduler, inside Supabase (free; no extra service).
--
-- WHY: Vercel's free plan runs scheduled jobs at most once a day. Appointment
-- reminders (~1 hour before) and broadcasts scheduled for later need a check
-- every 10 minutes. Supabase's own scheduler (pg_cron) calls the portal for us.
--
-- BEFORE RUNNING: replace PASTE_YOUR_CRON_SECRET_HERE below with the exact
-- CRON_SECRET value you set in Vercel (Settings → Environment Variables).
-- It is stored ENCRYPTED in Supabase Vault — never in this file or in GitHub.
-- Do not share it with anyone (Claude included). Safe to run more than once.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. The secret, encrypted (replaces an earlier copy if you run this again).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'ejo_cron_secret') THEN
    PERFORM vault.update_secret((SELECT id FROM vault.secrets WHERE name = 'ejo_cron_secret'), 'PASTE_YOUR_CRON_SECRET_HERE');
  ELSE
    PERFORM vault.create_secret('PASTE_YOUR_CRON_SECRET_HERE', 'ejo_cron_secret', 'EJO 100 — CRON_SECRET for the portal''s scheduled routes');
  END IF;
END $$;

-- 2. Every 10 minutes: appointment reminders + scheduled broadcast emails.
SELECT cron.unschedule('ejo-appointment-reminders') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ejo-appointment-reminders');
SELECT cron.schedule(
  'ejo-appointment-reminders',
  '*/10 * * * *',
  $job$
  SELECT net.http_get(
    url := 'https://ejo100-portal.vercel.app/api/cron/appointment-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ejo_cron_secret'))
  );
  $job$
);

-- 3. Check (after ~10 minutes): the job and its last runs. status_code 200 = working; 401 = the secret does not match Vercel's.
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'ejo-appointment-reminders';
-- SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 5;
