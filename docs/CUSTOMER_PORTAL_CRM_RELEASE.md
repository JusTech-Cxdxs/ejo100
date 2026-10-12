# EJO100 — Customer Portal, CRM, Portal Redesign and Test Programme

**Date:** 12 October 2026 · **Branch:** `platform/customer-portal-crm` · **PR:** #11 → `main`

## Recommendation: READY WITH DOCUMENTED LIMITATIONS

**Evidence:**
- CI is green on build, unit tests, secrets, static analysis, dependencies, real-browser E2E (two shards), dynamic security and load.
- An independent auditor, who did not build this work, found no P0 or P1. Its P2 and P3 findings were fixed or are documented below.

This is not a claim of zero vulnerabilities or unlimited scale.

### Owner actions (cannot be done from code)
1. **Change the Master Admin password.** A real-looking password is in git history (SEC-01).
2. **Website Vercel project — add these environment variables** (the customer portal now sends emails):
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
   - `NEXT_PUBLIC_WEBSITE_URL` (the public address of the website; used in reset links)
   - Optional: `CUSTOMER_SIGNIN_PER_MINUTE`, `CUSTOMER_RESET_REQUESTS_PER_5_MIN`
3. **Bank details for "how to pay".** Fill in each branch's bank details (or `COMPANY_BANK_DETAILS`). Until then customers are told to call their branch.
4. **Branch protection.** If it requires a check called "e2e", update it to "e2e (shard 1/2)" and "e2e (shard 2/2)".

## What is in this release

### Customer portal (`/customer-portal`, website)
**Sign-in and passwords**
- Sign-in uses the same split layout as the staff portal: logo, wordmark with the green rule, write-up and highlights.
- It has a password eye, a green "Remember me", clear errors and a rate limit.
- Forgot / reset password works for customers only. It is enumeration-safe, the link lasts 1 hour, and the expired-link page offers a new one.
- Reset links live in their own table, so a customer link can never be used on the staff portal, and the reverse.

**Navigation and pages**
- Mobile-first shell: a sidebar on desktop, and a slide-in drawer on phones.
- **Overview**:
  - "Needs your attention": estimate awaiting deposit, balance due, ready for collection with overstay days, cancellations and refunds, warranties ending, next service due.
  - Live progress steppers for each job.
  - Small green analytics.
  - Latest updates.
- **My vehicles** (with detail pages).
- **My services**: Job Cards and Vehicle Services, each with a friendly status timeline, the estimate (only once notified, only the customer's lines), payments, balance, minimum deposit and how to pay.
- **Payments**: full history.
- **Warranties**: cover, dates, claims.
- **Notifications**: a bell with a gentle sound, plus a full list. Includes broadcasts sent to customers.
- **Profile & settings**:
  - phone, second phone, primary address and extra addresses;
  - announcement emails toggle;
  - sound toggle;
  - change password.
  - Every change is audited.
- **Help & support**: branch contacts, FAQs, and an "AI support centre — coming soon" card.

### Staff portal — Customers (CRM)
- **`/crm` hub**:
  - KPIs, including profile gaps;
  - top spenders;
  - search across name, email, phones and plate;
  - filters, sorting and pagination;
  - "Register customer" (primary address and phone are now required).
- **`/crm/customers/<id>` (customer 360)**:
  - KPI tiles and a 12-month spend chart;
  - tabs for Vehicles, Jobs & services, Payments & refunds, Warranties & claims, Contacts & addresses, Notes and Activity. Activity is the audit trail of staff and customer changes, with before and after values.
- **Portal access**:
  - The welcome email carries a 72-hour "Set my password" link, never a password.
  - "Send set-password link" is available from the customer page.
  - Switching portal access off signs the customer out at once.
- **Customer names**: every customer name across the portal links to the customer page (print views stay plain).
- **Broadcasts**: can go to all customers or to selected customers, on their dashboard and by email (respecting their choice). Staff never see customer broadcasts, and the reverse.
- **Permissions**: `crm.view` and `crm.manage`, scoped to branch or organisation like the rest of the catalogue.

### Staff portal — look and feel
- A sticky glass header with global search (⌘K / Ctrl-K), a redesigned notification bell, theme and account menu.
- A sticky grouped sidebar with icons. It folds on desktop and is a drawer on phones and tablets.
- Global search: grouped results, keyboard navigation, permission-aware, organisation-fenced.
- One set of shared pieces:
  - `PageHeader` (hero with gentle motion), `StatTile` (animated count-up), `SectionCard` and `EmptyState`;
  - one status-colour rule: green done, amber waiting, red problem, blue in progress, grey closed.
- Analytics use brand green as the main colour. Other colours appear only where they carry meaning.
- Every module home page, list page and analytics page uses the new structure.

## Test programme (free and open-source tools)

| Area | Tool / method | Result |
|---|---|---|
| Real business workflows, every role, staff + customers | Playwright, 135 tests, 2 shards, real Postgres + Mailpit, both apps running | **0 failing, 0 known defects** (12 product defects found and fixed: E2E-01..07, 09..12) |
| Role × page matrix | Playwright (every role × every page) + HTTP sweep (11 accounts × 70 pages) | Matches the Authorization Catalogue both ways |
| Cross-organisation isolation | Other organisation's admin vs 24 record pages and print views; IDOR sweep (1,598 calls) | No leak, nothing changed |
| Signed-out access | All 604 server actions called without a session | None returned data or changed anything |
| Secrets | Gitleaks over all history + client-bundle scan | 1 historical (SEC-01, owner action); bundles clean |
| Static analysis | Semgrep (registry packs + 6 project rules) | 1 true positive (open redirect), fixed; CI blocks regressions |
| Dependencies | npm audit | **0 high**, 4 moderate (NestJS 10 — needs NestJS 11) |
| DAST | OWASP ZAP baseline (portal signed out and in, website) | No High; CSP `unsafe-inline` remains (Medium) |
| Database exposure | `anon` / `authenticated` probes, RLS on every table | RLS 93/93, no grants, 744 attempts refused |
| Concurrency / idempotency | Bursts of 10–50 real server actions, then Postgres state checked | Every invariant held (one payment per key, no overpayment, one open Job Card per vehicle, stock never negative, one approval); number clashes now retried |
| Load | k6 staged (smoke, baseline, ramp, spike, soak, recovery) + two-instance failover | 0 errors in every stage; figures below |

### Load (one `next start` on a 2-vCPU runner, CI Postgres on the same machine)

| Stage | Throughput | Live pulse p95 | Pages p95 | Search p95 |
|---|---|---|---|---|
| Baseline (10 users) | 18 req/s | 56 ms | 215 ms | 401 ms |
| Ramp (to 50 users) | 33 req/s | 531 ms | 1.5 s | 3.4 s |
| Spike (to 120 users) | 30 req/s | 2.4 s | 5.6 s | 12.8 s |
| Soak (25 users) | 37 req/s | 184 ms | 524 ms | 860 ms |
| Recovery | 18 req/s | 42 ms | 168 ms | 209 ms |

- **Failover:** with two instances behind a round-robin proxy, one was killed mid-test. About 1 % of requests failed during the 10 seconds after the kill, then 0 %.
- **Search:** plain-word searches now query 8 fewer tables, which should lower these figures. That has not been re-measured.
- **What this does not show:** this is a single small machine. Vercel scales functions horizontally, and its load balancing and autoscaling were not tested.
- **Proposed SLOs** (pages p95 < 1.5 s, pulse p95 < 0.5 s, errors < 1 %) are met up to about 25–50 concurrent heavy users per instance.

## Documented limitations

| # | Sev | Item | Plan |
|---|---|---|---|
| L1 | Medium | CSP still needs `'unsafe-inline'` for Next.js scripts | Nonce-based CSP in middleware |
| L2 | Medium | NestJS 10 moderate advisories (core, file-type) | NestJS 11 upgrade |
| L3 | Low | Rate limits are per instance (in memory) on Vercel | Vercel WAF rate-limit rules |
| L4 | Low | Customer broadcast emails are claimed before sending; if a function is cut off mid-send, the rest are not retried | Per-customer delivery records |
| L5 | Low | No request id across logs; no Sentry yet (optional, free tier) | Small logger + request id |
| L6 | Low | Realtime topic is global (anyone with the anon key can ping it; carries no data) | Private / per-organisation channel |
| L7 | Low | Search slows under a 120-user spike on one instance | Trigram indexes if needed |
| L8 | Low | E2E-08 "Notification summary failed" log line, intermittent | Investigate if it returns |
| L9 | — | HR, payroll, procurement and AI support are roadmap pages by design | Next phases |

## How to re-run everything
- **Unit tests:** `cd apps/portal && npm test`
- **Real-browser E2E, security and load:** open or update a PR to `main`. GitHub Actions runs `e2e.yml` and `security.yml`, and results appear as check-run annotations and job summaries.
- **Details:**
  - `docs/E2E_COVERAGE.md`: coverage matrix and defects
  - `docs/TESTING_PROGRAMME.md`: findings register, methods and figures
