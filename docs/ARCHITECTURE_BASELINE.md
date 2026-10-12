# EJO 100 — Architecture & Security Baseline v1

**Status:** binding from 6 October 2026; last checked against the code on 12 October 2026
(v29 schema). Every pull request is reviewed against this document (see
`.github/pull_request_template.md`). Changing a rule here is itself a reviewed change.
Where something is not built yet it says **Planned**.

The one question for every change: **which of these invariants does it touch, and how
does it keep them?**

---

## 0. The system as built
| Part | Where | Runs on | Notes |
|---|---|---|---|
| Staff portal | `apps/portal` (Next.js 15 App Router) | Vercel | Pages are server components; every write is a server action in `lib/actions/*` that calls Prisma directly. Route handlers only for auth, health, the live pulse and scheduled jobs (`app/api/**`). |
| Website and customer portal | `apps/website` (Next.js 15) | Vercel (separate project) | Public site plus `/customer-portal`, with its own Better Auth instance (`lib/auth-customer.ts`) on the customer tables. |
| API | `apps/api` (NestJS 10) | Render | Global session guard; health, plus read routes for the platform team only (`PlatformTeamGuard`). Not on the path of any business workflow. |
| Database | `packages/database` (Prisma 5.22, 95 tables) | Supabase PostgreSQL (EU) | The apps connect as the owner role. Supabase's public roles have no grants and RLS is on for every table (§7). |
| Email | `apps/portal/lib/email.ts`, `apps/website/lib/email.ts` | Any SMTP server | One adapter per app; templates in `lib/email-templates/**`. |
| Realtime | `lib/realtime-ping.ts`, `components/NotificationProvider.tsx` | Supabase Realtime | Data-free pings (§10). |
| Scheduled jobs | `app/api/cron/*` | Vercel cron (daily), Supabase `pg_cron` (every 10 minutes) | `CRON_SECRET` in the Authorization header, compared in constant time (`lib/cron-auth.ts`). |

```
staff browser ──► portal (Vercel) ──Prisma──► PostgreSQL (Supabase) ◄──Prisma── website + customer portal (Vercel) ◄── customer browser
                    │  ▲                          ▲                                   │
                    │  └── Vercel cron / pg_cron  │                                   └──► SMTP
                    ├──► SMTP                     └──Prisma── API (Render, platform team only)
                    └──► Supabase Realtime ──"something changed"──► staff browsers
```


## 1. Identity
- **Staff** sign in through Better Auth (`apps/portal/lib/auth.ts`): sessions in the
  database, HTTP-only cookies, 7-day sessions refreshed once a day of activity, sign-in
  limited to 20 a minute and reset requests to 5 per 5 minutes per instance. The portal and
  the API trust the same session table. A session cannot be created for a switched-off
  account (database hook), and `requireUser` re-checks on every request.
- **Customers** sign in to the customer portal through a separate Better Auth instance
  (`apps/website/lib/auth-customer.ts`) on separate tables (`Customer`, `CustomerSession`,
  `CustomerAccount`, `CustomerVerification`) with the cookie prefix `customer-auth` and
  30-day sessions. Set-password and reset links live in `customer_verifications`, so a
  customer token can never be redeemed on the staff portal, or the reverse. Customer pages
  query by the session's customer id, never by an id from the URL.
- Every server action calls `requireUser()` first; every database write in that request is
  attributed to that person (`setAuditActor`), including their organisation.
- An account with no organisation sees nothing of substance until an administrator places
  it; the check fails closed.
- **Assisted sessions (v29 schema):** `AssistSession` records when a support person works in
  a staff member's session (assistant, subject, reason, consent method, start, expiry, end).
  The table is IMMUTABLE and never available to AI.

## 2. Organisation model (tenancy)
```
Platform (EJO 100 team) ─┬─ Organisation (e.g. Kewalram) ─┬─ Business unit ─ Branch ─ Department ─ Team
                         └─ Organisation …               └─ People, roles, customers, providers, policies
```
- **Platform team** = holders of the Master Administrator role. Invisible to organisations
  (shown as "Platform support"); the owner account (`PLATFORM_OWNER_EMAIL`) can only be changed
  by the owner; a database trigger (v22) blocks granting the Master role outside a marked transaction.
- **Tenant fence:** `decide()` refuses any record whose branch is outside the person's
  organisation, before any scope (ALL included). Lists use `reachWhere` (branches of the
  organisation), directly-owned data uses `orgWhere` / `orgOwned`.
- **Operating branch:** resolved per person (`getWorkshopBranchId`): their own Workshop branch →
  their organisation's → (platform team / scheduled jobs) the first.

## 3. Roles (segregation of duties)
| Role | Scope | Does |
|---|---|---|
| Organisation Administrator | All branches | People, roles, structure, settings; reads everything; **no departmental transactions** |
| Branch Administrator | One branch | That branch's people and roles; cannot hand out administrator roles |
| Front Desk (Receptionist) | Branch | Customers, vehicles, opens Job Cards / Vehicle Services, notifies customers, receives visitors |
| Workshop Supervisor | Assigned jobs | Accepts the job, assigns technician, writes **and approves** estimates |
| Technician | Assigned jobs | Accepts/rejects, inspects, works, writes estimates (cannot approve) |
| Workshop Manager | Branch | Final approvals, close/cancel, PRS/EPR approvals, passes; never opens jobs |
| Finance Officer | Branch | Payments, refunds, EPR review and cash |
| Store Manager / Officer | Branch | Parts, prices, stock, receipts, releases, deliveries |
| Warranty HOD / Officer | Branch | Warranties, claims (HOD approves) |
| Chief Security / Security Officer | Branch | Gate, visitors, incidents (Chief) |
| Department Head | Department | Approves their department's exit passes |
| Calendar User / Scheduling Admin / Broadcaster | Own / all | Calendars, rooms and aides, broadcasts |
| **Everyone** | Own | Request their own exit pass; nothing else by default |

Front desk, branch and organisation administrators and the workshop manager also hold
`crm.view` / `crm.manage` (Customers). Defaults are reviewed code (`lib/authz/catalogue.ts`,
17 organisation roles); headquarters may **add** a catalogue permission to a role on the
Roles page. A person with several roles gets the widest grant. The table above is a summary;
the catalogue file is authoritative.

## 4. Permission model
`PERMISSIONS` in the catalogue is the only list of things that can be done (49 on
12 October 2026, including `crm.view` and `crm.manage`). A permission with no code enforcing
it may not exist; the Permissions page, the Profile page's "what I can do" and the welcome
email are generated from the same code (`lib/authz/describe-access.ts`).

## 5. Scope model
`ALL` (every branch of the organisation) · `BRANCH` · `DEPARTMENT` · `ASSIGNED` (the job's
supervisor / technician, or the person who opened it) · `OWN`. `homeBranch` on a check means
the person must **belong** to that branch (approvals and money).

## 6. Authorization flow
```
request → requireUser → getPrincipal (roles, grants, branch, organisation branches)
        → decide(permission, record) → tenant fence → scope → allowed / refused (audited as access.denied)
        → workflow state check (in the action, atomic compare-and-set)
        → database constraints (unique keys, foreign keys, triggers) → commit
```
- **Pages:** `guardPage` / `guardAnyPage` in layouts. **Actions:** `authorize`, `authorizeOnJobCard`,
  `authorizeOnService`, or an audited workflow check (`refuse`). **Buttons:** `allows` (same rule).
  **Records:** `canSeeRecord` / `seeOrNull` (out of reach = "not found"). **Lists, search, analytics:** `reachWhere`.
- **Anything hanging off a record** (payments, refunds, estimates, requests, audit trails):
  `seeJobCard` / `seeService` / `seeVehicle` / `seePart` / `seeBranch` / `seeBranchAnyOf` check
  the PARENT record. Out of reach and missing look the same ("not available" / not found), and
  refusals are audited as `access.denied`.
- **Branch-owned lists** of the organisation (rooms, goods receipts, warranty badges):
  `branchOwnedByMyOrganisation`; lists hanging off jobs: `jobOrServiceReach`.
- **Security desk** actions check the record's branch (`onMyDesk`); actions people take on their
  own items (hosts, requesters, approvers) check the record is in their organisation
  (`inMyOrganisation`). **Staff lists** (names and emails) are only given for the person's own
  organisation (`branchInMyOrganisationOrSystem`; background jobs and the platform team excepted).
- **Accounts:** public sign-up is closed (staff and customers), and the auth library's own
  update-user / change-email / delete-user endpoints are switched off, so nobody can change their
  own organisation or account type. Staff are added by an administrator (Users → "Add a staff
  member": the person sets their own password from an email link; no password is ever emailed).
  A deactivated account cannot start a session; switching it off deletes its sessions; the
  portal (every request through `requireUser` and the app layout) and the API guard re-check it.
  A refused browser is sent to `/signed-out`, which clears its session cookies.
- **Never:** trust a browser-supplied id, branch, role or price; hide a button as protection.
- **CI:** `tests/guard-coverage.test.ts` fails if any data-changing server action has no check;
  `tests/tenant-coverage.test.ts` fails if a read or write by id does not check the record, a
  desk action skips the branch check, sign-up reopens, or a fenced list loses its fence.

## 7. Tenant isolation rules
1. Every new table is declared in `lib/governance/data-inventory.ts` (CI enforces it).
2. A BRANCH table carries `branchId`; an ORGANISATION table `organisationId`; a child reaches
   its tenant through a declared parent column.
3. Every read of tenant data goes through `reachWhere` / `orgWhere` / `orgOwned` or a record
   check. Every create stamps the owner (`myOrganisationId`, the operating branch).
4. Emails, notifications, search, analytics, exports and realtime obey the same fence.
5. Audit rows carry `organisationId`, stamped centrally in the database layer.

## 8. Data classification & lifecycle
The data inventory (`apps/portal/lib/governance/data-inventory.ts`, enforced by
`tests/data-inventory.test.ts`) declares, for every table: **tenancy, owner column,
classification** (INTERNAL · PERSONAL · FINANCIAL · SECURITY · SECRET · AUDIT), **lifecycle**
(state machine · immutable · archive · cascade · expires · platform delete · editable),
**retention**, and **AI access** (NEVER · AGGREGATE_ONLY · AUTHORISED_USER).

State on 12 October 2026 (v29, 95 tables):
| AI access | Tables |
|---|---|
| NEVER (13) | Sessions, accounts and verification tokens for staff and customers; `EmployeeDocument`; notification read state and preferences; `SecurityEmailLog`; `AssistSession`; `ErrorEvent` |
| AGGREGATE_ONLY (2) | `EmployeeProfile`, `AuditLog` |
| AUTHORISED_USER (80) | Everything else, read only through the asking person's own permissions |

v29 additions: `AssistSession` (ORGANISATION, SECURITY + AUDIT, IMMUTABLE, kept with the audit
trail) and `ErrorEvent` (ORGANISATION, INTERNAL, EXPIRES after 90 days). How the AI phase uses
these levels is in `docs/AI_READINESS.md`.
- Financial records (payments, refunds, goods receipts) and the audit trail are **immutable**.
- Business records end through their **workflow** (cancel / close with approval), not deletion.
- **Planned: Recycle Bin.** a deletion flag with a reason; hidden everywhere; restorable by
  headquarters; permanently purged only by the platform team after the retention period.
  Records that took money are cancelled and refunded, never deleted.

## 9. Audit rules
- Business events: `writeAuditLog` (plain-language actions). Every data change: the database
  journal (before/after, secrets redacted). API requests: logged with status and duration.
- Nothing in the audit trail is ever edited or deleted. Scheduled-job runs are kept in their own
  view so they never bury people's work.

## 10. Realtime rules
A realtime ping carries **no data**, only "something changed". The browser then re-reads through
the same authorization. Caches and realtime are accelerators, never authorities.
- As built: the portal posts to one Supabase Realtime broadcast topic (`ejo-changes`,
  `lib/realtime-ping.ts`) with the public anon key, at most one ping per 750 ms. Browsers also
  call `GET /api/live/pulse` (organisation-scoped) every 10 s while in use, every 60 s when push
  works or the tab is idle, and never in a hidden tab. The customer portal has its own
  `/api/customer/pulse`.
- Known limit: anyone with the anon key can publish to the topic (it carries nothing, but can
  cause refreshes). **Planned** with Messages: private per-organisation / per-person channels
  enforced by RLS policies on `realtime.messages`.

## 11. Event rules
Every meaningful business change writes a named audit event (`job_card.approved`, `payment.recorded`
…). Notifications, the activity feed, analytics and, later, integrations and AI consume these
events. **Planned:** a typed event catalogue as the formal contract; no message broker until load requires one.

## 12. Transactions & concurrency
Two primitives, in `lib/integrity.ts` (pure half: `lib/integrity-core.ts`):
- **Compare-and-set:** workflow status changes are `updateMany` with the expected state in its
  `where`, checked with `claimed()`; 0 rows means someone else acted first, and the person sees
  "Someone else changed this just now — refresh…" with nothing written. This covers Job Cards,
  Vehicle Services, estimates (both kinds), close/cancel requests, parts and procurement requests,
  warranty claims and warranties, policy/provider deletions, exit passes, road tests, visits,
  deliveries, contractor passes, incidents, appointments and pricing alerts. Three plain status
  writes remain, each named with its reason in `tests/integrity-coverage.test.ts` (inspection
  completion, creating a draft estimate, a legacy-data repair). Decisions that touch several rows
  (approving a close or a cancellation) are one transaction that locks the Job Card / Vehicle
  Service first, then compare-and-sets each step.
- **Row locks** (`lockRows` / `lockExisting`: `SELECT … FOR UPDATE`, ids de-duplicated and sorted
  by `lockIds` so two transactions queue instead of deadlocking) where a total is checked and then
  changed: payments, refunds and who-pays decisions (the Job Card / Vehicle Service row), stock
  reservation and release (the `part_stock` rows), room and host bookings (room first, then host),
  the last active Administrator / Master Administrator count, and one-per-record requests
  (cancellation, close, parts and outside-purchase requests are worked out and created under the
  parent's lock).
- Estimate lines, Store matching and estimate submission (read, reprice, check, submit) run inside
  a transaction that first re-claims the estimate in the status the editor saw, so an approved
  estimate can never change underneath and nothing unpriced slips into a submission.
- Escalating a Vehicle Service claims it first (on `escalatedAt`; a claim left by a request that
  died expires after ten minutes) and creates the Job Card already linked to it in one write, so a
  second click cannot open a second Job Card and no Job Card exists without its link. While the
  claim is held the service is read-only (no estimate, inspection change or cancellation).
- Inside a transaction only the transaction client is used (a second connection could wait on
  itself in a serverless pool of one).
- **Idempotency keys** (unique in the database) on payments, refunds and goods receipts: a resent
  form records once (checked again under the lock), so a resend is recognised, not refused.
- Human reference numbers (`RF-…`, `GRN-…`, `PRS-…`, `EPR-…`, …) are "latest + 1" protected by a
  unique constraint; money and stock creations retry with the next number on a clash, everything
  else tells the person to submit again. Nothing is ever duplicated.
- The data journal (`packages/database/src/audit-journal.ts`) keeps before/after values for
  compare-and-set writes made outside a transaction (inside one it records the values written and
  the expected state from the `where`), skips writes that changed nothing, and drops the entries of
  a transaction that rolled back: it records what happened, never what was tried.
- Enforced in CI: `tests/integrity-coverage.test.ts` reads the source (no unlisted plain status
  write; every compare-and-set names an expected state; the locks above are present);
  `tests/concurrency.db.test.ts` runs real parallel transactions on a throwaway PostgreSQL using
  the same lock SQL (with control tests showing the race and the deadlock it prevents);
  `packages/database/tests/audit-journal.test.ts` covers the journal rules.
- **Known limits:** the database tests exercise the SQL patterns, not the server actions through
  the Prisma client; a manager approves the estimate as it is when they click, not a version
  token from their screen; opening a Job Card or Vehicle Service has no idempotency key (the
  submit button blocks double clicks, a resend after a dropped connection could open a second
  one); stock reserved for a request whose job is later cancelled stays reserved until Store and
  the Manager unwind it by hand.

## 13. Financial integrity
Totals are computed from immutable lines (estimate lines, payments, refunds); paid amounts are
always **net of refunds**; a cancelled job that took money cannot release the vehicle until refunded.

## 14. Backup & recovery
Supabase daily backups. RPO / RTO targets and a restore drill are in `docs/RUNBOOKS.md`.
Production database changes come only from production deploys, never with data loss enabled;
destructive changes are made by reviewed SQL with a backup.

## 15. Integration boundaries
External services (email today; SMS, WhatsApp, payments, X, Microsoft/Google later) sit behind
one adapter each (`lib/email.ts` is the pattern). Business code never calls a provider directly.
Integrations receive only what the triggering person may see.

## 16. AI security model
**AI is never an authorization authority.** It may observe, analyse, summarise, recommend and
draft, always as the person using it, through the same `authorize` / `reachWhere` tools, and
only data whose inventory entry allows AI. A human approves every action; the workflow, the
fence and the database decide whether it commits. SECRET data is never available to AI.
**Planned** boundary: a separate Python service with no database credentials, called by the
portal with a service token and context already fetched as the user. Details, gaps and the
phased plan: `docs/AI_READINESS.md`.

## 17. Testing strategy
- `ci.yml` (every push and pull request): lint, TypeScript strict, unit and source tests
  (catalogue decisions allowed **and** denied; guard, tenant, data-inventory and
  integrity coverage read the source; analytics reconciled against hand-worked answers),
  database tests (real parallel transactions on a throwaway PostgreSQL), a full production
  build, `npm audit`.
- `e2e.yml` (pull requests to `main`): Playwright against production builds of both apps,
  PostgreSQL 16 with the real schema and seed, Mailpit; one account per role, a second
  organisation for cross-organisation attempts; 135 tests on the last full run.
- `security.yml` (pull requests to `main`): Gitleaks over all history, Semgrep with project
  rules, OWASP ZAP baseline, access-control sweeps (role × page, IDOR, every server action
  signed out), RLS and grant probes as `anon` / `authenticated`, concurrency bursts, k6 load
  stages.
- **Planned:** the same load test against a staging copy on the production providers.

## 18. Deployment
Pull request → CI → Vercel preview (never touches the database) → merge → production deploy:
1. `scripts/predeploy/*.sql`: additive, re-runnable SQL the push needs first;
2. `prisma db push` **without** `--accept-data-loss` (a destructive change stops the deploy);
3. `scripts/postdeploy/*.sql`: RLS on every table, no public grants, data clean-ups.

Run by `scripts/db-push-if-render.js` or `scripts/db-push-if-vercel.js` (production only;
previews and pull requests skip). One-off data changes are reviewed SQL scripts
(`scripts/vNN-*.sql`), additive and safe to run twice.

## 19. Observability
Structured JSON error logs with a reference number shown to users (`instrumentation.ts`,
`lib/errors.ts`, `lib/log.ts`); `/api/health` on portal and website and `/api/v1/health` on the
API; every scheduled job recorded and shown on Settings with email-delivery health; refusals
audited. The v29 schema adds `ErrorEvent` so a reference quoted by a user can be looked up for
90 days. **Planned:** uptime and error alerting, a request id across logs.

## 20. Scaling triggers (only with evidence)
| Add | When |
|---|---|
| Redis / shared cache | Cache misses or rate limits need sharing across many instances |
| Queue + workers | Emails or jobs take long enough to slow a user's action |
| Read replica | Analytics queries measurably slow the live system |
| Region alignment | Paid plans allow app and database in one region |
| Service extraction / Kubernetes | A module needs independent scaling or release |
