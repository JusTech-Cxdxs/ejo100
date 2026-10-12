# EJO100 Version 1 — Closure Report

**Date:** 12 October 2026 · **Branch:** `platform/v1-closure` (PR #8) · **Commit:** see PR head

## Recommendation: READY WITH DOCUMENTED LIMITATIONS

Version 1 is fit to release once the three owner actions below are done.

Evidence:
- **CI is green:** build, typecheck, 81 unit and reconciliation tests, and real-browser E2E on a real Postgres and mail server.
- **Two independent reviews** found no open P0 or P1.
- **Load test:** a measured baseline with zero errors.

This is not a claim of zero vulnerabilities or unlimited scale; the limitations are listed below.

### Owner actions before or at release (cannot be done from code)
1. **Supabase → SQL editor:** confirm row-level security is ON for every table. Deploying this PR also enables it automatically, via `scripts/postdeploy/0001-rls-default-deny.sql`.
2. **Change the Master Admin password.** A real-looking password was in `.env.example` in an earlier commit; that file now holds a placeholder.
3. **Rotate `BETTER_AUTH_SECRET`** in Vercel and Render if this has not already been done. Everyone will have to sign in again.

## What was tested, and how

| Area | Method | Result |
|---|---|---|
| Sign-in, wrong password, protected page → sign in → back, forgot / reset password, link works once, unknown email reads the same, live check refuses signed-out | Playwright + Mailpit (real emails opened and links followed) | Pass. Reset links expire after 1 hour (Better Auth refuses an expired token). Expiry and the sign-in rate limit are configured and reviewed, not browser-tested. |
| Staff onboarding → welcome email → set password → first sign-in | Playwright + Mailpit | Pass (root cause of the failed emails fixed: missing `verifications.updatedAt`) |
| Roles: each role sees only its menu and pages; refused pages redirect to Access denied | Playwright, one account per role | Pass |
| Workshop journey: open JC → second JC for same vehicle refused → supervisor approves/assigns → technician accepts → cancellation requested → Manager approves | Playwright | Pass |
| Cross-organisation: another organisation's admin opens a Job Card URL | Playwright | Pass — "Page not found", no data |
| Structure: departments under branches, business units, system departments protected | Playwright + unit | Pass |
| Analytics (business, inventory, warranty) | Hand-worked reconciliation tests (`tests/analytics.test.ts`) | Pass |
| Every server action calls `authorize` / tenant fence | Static coverage tests | Pass |
| Deploy SQL additive, re-runnable, runs before/after push, never `--accept-data-loss` | Static test + executed twice on local Postgres 16 | Pass |
| Security review, workflow QA, analytics audit, performance audit, final diff review | Five independent agents | All P0/P1 fixed |

## Load baseline (one `next start` on a 2-vCPU GitHub runner, CI Postgres on the same machine, 30 s per workload)

| Workload | Requests | Throughput | p50 | p95 | p99 | Errors |
|---|---|---|---|---|---|---|
| Live pulse, 50 concurrent clients back to back | 6,258 | 207/s | 222 ms | 317 ms | 583 ms | 0 |
| Heaviest pages (dashboard, Job Cards, inventory, analytics, users), 10 concurrent | 742 | 24.7/s | 363 ms | 951 ms | 1,090 ms | 0 |
| Sign-in, 20 (5 at a time) | 20 | — | 332 ms | 349 ms | 372 ms | 0 |

Pages refresh the pulse every 10 s while visible, and every 60 s when push works or the tab is idle. That means 207/s on one instance covers roughly 2,000 open tabs.

Production runs on Vercel and Supabase, so its latency differs: network distance, cold starts and the connection pooler all play a part. Re-measure there with the same script (`apps/portal/e2e/load.ts`) against a staging copy, never production.

## Findings register (this closure programme)

**P0 — none open.** Fixed:
- Row-level security was not enforced on the public API roles.
- A pricing digest was callable as a public server action.

**P1 — none open.** Fixed:
- Welcome and reset emails failed (schema).
- Cron secret accepted in the URL; it is now a header only, compared in constant time.
- Staff without an organisation were not fenced; the check now fails closed.
- Status changes did not check authorisation.
- Stock reservations were not released when a job was cancelled or closed. Withdrawal is now automatic, and a one-off clean-up handles older data.
- Analytics cost window and work in progress counted bookings.
- Inactive customers could still sign in to the customer portal.
- Open redirect on the inspection form.
- Customer portal showed lines not billed to the customer.

**P2 — fixed in this PR**
- Segregation of duties:
  - the Manager cannot give final approval on a job they approved as supervisor;
  - nobody approves their own cancel or close request.
- One open Job Card / Vehicle Service per vehicle (row lock).
- Number-clash retries for appointments, visits, warranties and claims.
- Mileage and odometer validation.
- Approved estimates are locked; a Manager can return one for changes.
- Organisation fences on scheduling.
- Branch-scoped structure rights.
- Indexes (v27).
- Reload storm reduced.
- Charts lazy-loaded.
- Security headers.
- Sign-in timing no longer reveals whether an account exists.

**Documented limitations (accepted for V1)**

| # | Sev | Item | Why acceptable now / plan |
|---|---|---|---|
| L1 | P2 | NestJS 10 API: advisories in multer, body-parser and lodash (`npm audit`: 0 critical, 4 high, 7 moderate) | The API takes no file uploads and does not use `_.template`, `_.unset` or `_.omit` on user input. Upgrade to NestJS 11 in V1.1. |
| L2 | P3 | postcss inside Next (build-time only) | Processes only our own CSS at build. Clears with the next Next.js patch. |
| L3 | P3 | Outside-purchase (EPR) reviewer and disburser can be the same person | Audited. Add segregation of duties in V1.1. |
| L4 | P3 | Some people and record pickers are not organisation-checked on read | Writes are fenced. Tighten in V1.1. |
| L5 | P3 | Hard deletes remain for Master Admin on a few records | Master Admin only, audited. |
| L6 | P3 | API cookie name differs from the portal's | The API has no session-protected route in V1. |
| L7 | P3 | No load measurement on production infrastructure | Baseline above. Run `load.ts` against staging. |
| L8 | — | HR, Payroll, Procurement, Manufacturing and the other roadmap modules | Shown as "Coming next" roadmap pages by design. Not built in V1. |

## Module and route inventory (portal)

- **Size:** 124 pages, 6 route handlers (auth, live pulse, three crons, signed-out).
- **Live modules:**
  - Dashboard
  - Workshop (Job Cards, Vehicle Service, parts requests, outside purchases, refunds, custody, service tracker, customers, vehicles)
  - Inventory (parts, goods receipts, pricing, estimate matching, analytics)
  - Warranty (register, policies, providers, claims, analytics)
  - Security & Gate (visitors, contractors, deliveries, vehicles, exit passes, road tests, incidents, register)
  - Schedule (calendar, appointments, rooms, availability, aides)
  - Notifications and broadcasts (with analytics)
  - Business Analytics
  - Administration (users, roles, permissions, structure, branches, organisation, settings, audit logs)
  - Profile
  - Print views
- **Roadmap:** `/roadmap` plus 16 module pages (HR with the full gate / clock-in / hours / payroll / ID-card / leave / performance / recruitment plan, and the rest).

## Metric register (Business Analytics — definitions the tests reconcile)

| Metric | Definition |
|---|---|
| Sales | Customer + warranty lines of jobs finished in the window. Goodwill and internal lines are excluded. |
| Given away | Goodwill and internal lines. |
| Cost | Parts issued at receipt cost plus sublet, for the jobs counted in Sales. |
| Gross profit / margin | Sales − Cost; margin = profit ÷ sales. |
| Collections | Payments received in the window − refunds recorded in the window. |
| Receivables | Balance of customer-billed lines on finished, uncancelled jobs. |
| Owed back | Money taken on cancelled jobs, not yet refunded. |
| WIP | Open jobs that have started; scheduled bookings are excluded. |
| Forecast | Linear trend over completed weeks only (the current partial week is ignored). |
| Stock value | FIFO at receipt cost. Units received without a cost are valued at the part's average and counted as "uncosted". |
| Months | Africa/Lagos calendar. |

## What is left after V1 (copy-paste list)

1. Owner: confirm RLS in Supabase, change the Master Admin password, rotate `BETTER_AUTH_SECRET`.
2. Merge PR #8. The production deploy runs pre-deploy SQL → `prisma db push` → post-deploy SQL (RLS plus the stale-reservation clean-up).
3. After deploy: sign in, add a test staff member, confirm the welcome email arrives, then switch the test account off.
4. V1.1:
   - NestJS 11 upgrade (L1);
   - EPR segregation of duties (L3);
   - organisation-checked pickers (L4);
   - replace hard deletes with archive (L5);
   - staging load test (L7).
5. Version 2 (separately scoped): HR and attendance (gate check-in, clock in/out, hours rules, ID cards / QR / NFC), then payroll from attendance, leave, performance and recruitment, as laid out on `/roadmap/hr`.
