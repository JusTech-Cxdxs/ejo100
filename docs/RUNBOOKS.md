# EJO 100 — Operations Runbooks (Phase A close-out)

These steps need account access (GitHub, Supabase, Vercel, Cloudflare); everything the code can
do is already done and tested. Tick each box; record the date and who did it.

## 1. GitHub hardening  ☐
1. Settings → General → Danger zone → **Change visibility → Private** (done 6 Oct 2026; confirm it is still private).
2. Settings → Code security → enable **Secret scanning** + **Push protection**, **Dependabot alerts**
   and **Dependabot security updates**.
3. Settings → Branches → rule for `main`: require a pull request, require the **CI** check to pass,
   block force-pushes and deletion.
4. Settings → Collaborators: only people who need write access. Remove old tokens / deploy keys.
5. Confirm no secrets in history: Security → Secret scanning alerts should be empty. (The code
   scan done in this project found none; `.env` files are not committed.)

## 2. Prove the Supabase surface is closed  ☐  (Supabase → SQL Editor)
Each query must return **0 rows**.
```sql
-- Tables or views the public roles can still read or write
SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
-- Tables without row-level security
SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;
-- Functions the public roles can call
SELECT p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
-- Storage buckets that are public
SELECT id, name FROM storage.buckets WHERE public = true;
```
Then **Project Settings → API**: the **service_role** key must exist only in server environment
variables (never `NEXT_PUBLIC_…`). **Realtime**: the app uses one broadcast channel carrying only a
timestamp — no table is published for Realtime (Database → Replication: no `public` tables listed).

## 3. Staging environment  ☐
1. Create a second Supabase project **"ejo100-staging"** (same region as production).
2. From a developer machine pointed at staging (`DIRECT_URL`): run `scripts/predeploy/*.sql`,
   then `prisma db push` (never with `--accept-data-loss`), then `scripts/postdeploy/*.sql`, the same
   order a production deploy uses (`scripts/apply-predeploy-sql.js`).
3. Vercel → portal project → Settings → Environment Variables: give the **Preview** environment the
   staging `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET` (different from production),
   `BETTER_AUTH_URL`, `NEXT_PUBLIC_PORTAL_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `CRON_SECRET`, and email settings pointing to a test mailbox.
4. Every pull request then gets a staging deployment. Test there; merge to `main` only when green.
5. Render: a second (free) service `ejo100-api-staging` on the `staging` branch with staging variables.

## 4. Backup → restore drill  ☐  (do before go-live, then every quarter)
1. Production Supabase on a plan with **daily backups + point-in-time recovery**.
2. Agree targets with management: **RPO** (most data you may lose — suggested ≤ 15 minutes with PITR)
   and **RTO** (time to be working again — suggested ≤ 4 hours).
3. Drill: restore the latest backup into a **new** project → point a Vercel Preview at it → sign in →
   open a Job Card, record a test payment, run a search, open Audit Logs → note how long it took
   (that is your measured RTO) → delete the drill project.
4. Never put database dumps in GitHub (artifacts or files) — they contain customer data.

## 5. Load test  ☐  (staging only — `ops/load-test/k6-portal.js`)
Run it, then record p50 / p95 / p99 latency and error rate per stage, and watch Supabase →
Reports (CPU, connections) at the same time. Fix the **measured** slowest pages first. A first run
is expected to show the Washington ↔ Frankfurt distance — region alignment is the first fix.

## 6. Failure drills  ☐  (staging) — expected result: a friendly message, no lost data
| Drill | How | Expected |
|---|---|---|
| Double-click a payment | click Record twice fast | one payment; second refused |
| Resubmit after a dropped connection | DevTools → Offline after clicking Record, then online, click again | one payment (same operation id) |
| Two people approve the same PRS | two browsers, approve at once | one succeeds; the other: "just done by someone else" |
| Database unreachable | pause the staging project | "The database is not reachable right now…" |
| Email provider down | wrong SMTP password on staging | action succeeds; email logged as failed |
| Realtime down | block `*.supabase.co` websocket | header shows Auto-updating; pages still update |
| Session expires mid-form | delete the cookie, submit | sent to sign in, then back to the page |
| Record deleted meanwhile | delete in one tab, act in another | "This record no longer exists…" |

## 7. When to add infrastructure (measurable triggers)
| Add | When this is measured |
|---|---|
| **Cloudflare** (DNS proxy + WAF + bot fight) | before public go-live, or any abusive traffic seen in logs |
| **Redis** (shared cache / rate limit / queue) | more than one API instance, or p95 > 1 s on cached reads |
| **Queue + worker** | any job > 10 s, or bulk email / import / export |
| **Read replica** | analytics queries > 2 s at p95, or primary CPU > 70% sustained |
| **Partitioning** | audit_logs or notifications past ~50 million rows |
| **Pre-computed analytics tables** | Business / Inventory / Warranty analytics > 3 s at p95 |

## 8. Observability (current and next)
Now: one JSON log line per server error (reference, route, time; secrets redacted); emails logged
with sent / failed; audit trail for every business action. Next (cheap, high value): connect a log
drain (Vercel → Log Drains → e.g. Better Stack) with alerts on `"level":"error"` spikes and on
`security.email_failed`; enable Vercel Speed Insights for real-user page timings.


## Scheduled jobs — "am I getting the emails?"
1. Open **Settings** in the portal: each job shows its last run, what it sent, and whether it is on time.
   A job that sends nothing has found nothing to send (no appointments today / no open price alerts).
2. **Email delivery** (platform team): sent / failed in the last 7 days and the last error. Failures
   almost always mean SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_FROM are missing or wrong in Vercel.
3. **Appointment reminders "Not running on time"**: run `scripts/v25-supabase-scheduler.sql` (with your
   CRON_SECRET pasted in) in Supabase. Check: `SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 5;`
   — 200 = working, 401 = the secret in Supabase does not match the one in Vercel.
4. Vercel's own crons (digest, pricing) need `CRON_SECRET` set in Vercel; Vercel sends it automatically.
