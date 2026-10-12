# EJO 100 — Master Plan

The single list of what is **done**, what is **left**, and **in what order**. Every request made
for this project is recorded here so nothing is lost. Updated in every pull request that changes it.
Rule: one phase = one pull request (or a short series), each with tests, an independent review,
CI green and a Vercel preview, merged by the owner. No AI / ML / X / external integrations until
Phase 12 is green; today's design must not prevent them.

Status words: **Done** (merged) · **Partly done** · **In progress** · **Next** · **Planned**

---

## Where we are (12 Oct 2026)

| # | Phase | Status | PR |
|---|---|---|---|
| 1 | Roles realistic (segregation of duties), organisation + branch administrators, organisation isolation | Done | #3 |
| 2 | Architecture & Security Baseline; scheduled jobs out of activity; data inventory | Done | #4 |
| 3 | Integrity & concurrency ("two users at once"): money, stock, workflow, bookings | Done | #5 |
| 4 | Authorization & cross-organisation attack audit (refunds first) | Done | #6 |
| 4b | Version-1 polish: live-update load fix, Render deploy fix, theme, wordmark, profile, employee IDs, welcome and access-changed emails | Done | #7 |
| 5 | Unfinished surfaces: customer portal (controlled invitations, forgot / reset, services, payments, warranties) | Done | #11 |
| 6 | Analytics correctness: metric register and reconciliation tests against hand-worked answers | Partly done (prescriptive inventory analytics still open) | #8 |
| 7 | Notifications, email, realtime and scheduler checked end to end | Partly done (emails followed in E2E; private realtime channels planned with Messages) | #8, #11 |
| 8 | Data lifecycle: Recycle Bin, history views | Planned | |
| 9 | Look & feel: shell redesign, light and dark on every page, mobile drawer | Done | #11 |
| 10 | End-to-end journeys and unpredictable users (Playwright, 135 tests) | Done | #11 |
| 11 | Production reliability: k6 stages, failover, error references (v29) | Partly done (staging load test open) | #8, #11 |
| 12 | Final enterprise readiness audit | In progress (V1 final phase) | |
| — | AI phase: AI support centre, Intelligence (Python service); see `docs/AI_READINESS.md` | Next | |

The sections below keep each phase's original scope and findings for the record.

---

## Roadmap additions — 12 Oct 2026 (V1 final phase)
Requested by the owner and recorded on `/roadmap` (`apps/portal/lib/roadmap.ts`), each with a design section:
- **Targets & performance**: targets per organisation, branch, department and person (jobs, revenue, parts sales, turnaround, CSAT), approved one level up, progress computed from records and shown on dashboards.
- **Messages**: in-portal chat; official messages are permanent, can be emailed and appear in the record's history; informal chat has a retention period.
- From a review of SAP S/4HANA, Dynamics 365, Odoo and dealer-management systems: Approvals & workflow designer, Quality & checklists, Technician app (offline, job clocking), Vehicle sales, Service plans & contracts, Customer feedback, Price lists / promotions / loyalty, Fleet & business accounts, Tax & e-invoicing (NRS MBS), Data warehouse & BI. Existing entries extended: Finance (budgets), Documents (e-signature), Fixed assets & tools (tool crib), Customer app (online booking), Integrations (manufacturers, open API).
- The AI phase is marked **Next**: AI support centre (customer and staff tickets with a drafting assistant) and Intelligence, both behind a separate Python service (`docs/AI_READINESS.md`).

## Customer portal + CRM + redesign + full test programme — 12 Oct 2026 (PR #11)
Customer portal rebuilt (mobile-first, forgot/reset, services, payments, warranties, notifications, profile), staff CRM (hub, customer 360,
portal access, customer broadcasts), portal shell and module redesign, and a free/open-source test programme (Playwright 135 tests, Gitleaks,
Semgrep, ZAP, k6, RLS and concurrency checks). Recommendation: **READY WITH DOCUMENTED LIMITATIONS** — see
[CUSTOMER_PORTAL_CRM_RELEASE.md](CUSTOMER_PORTAL_CRM_RELEASE.md).

## V1 closure — 12 Oct 2026 (PR #8), done
Final audit, hardening and E2E/load testing done. Recommendation: **READY WITH DOCUMENTED LIMITATIONS** — see [V1_CLOSURE_REPORT.md](V1_CLOSURE_REPORT.md) for the findings register, load baseline, metric register and the list of what is left.

## Version 1 scope (decided 7 Oct 2026)
The first version is **what is already built, perfected** — for the presentation and heavy
multi-user production testing. Order: application solid → analytics reviewed → then AI →
presentation → later modules.
- **In version 1:** Dashboard, Organisation, Branches, Users, Roles, Permissions, Workshop (Job
  Cards, Vehicle Service, estimates, custody, parts requests, outside purchases, refunds),
  Inventory (+ Inventory Analytics), Warranty (+ Warranty Analytics), Security, Scheduling,
  Business Analytics, Notifications, Audit Logs, Settings, My Profile.
- **Next version (hidden from the menu, placeholder routes removed):** HR, Payroll, Finance,
  Procurement, Suppliers, Warehouse, Manufacturing, Documents, Reports, Module Registry,
  Branding Engine, Help Center, and the separate Business Units / Countries / States / Cities /
  Departments / Teams editors. They stay listed (COMING_SOON) in `apps/portal/lib/modules.ts`.
- Analytics must follow the **Action Contract**: every insight links to the exact record or the
  exact filtered list behind it.

## Phase 4b — Version-1 polish (PR #7), done
- [x] Live updates no longer load the server: the change check is a tiny organisation-scoped
      `GET /api/live/pulse` (was a page-posting server action every 3 s), every 10 s while the
      page is in use, once a minute when idle or when instant push is on, never in a hidden tab;
      pages refresh at most every 10 s, analytics pages at most once a minute.
- [x] Submission flood limit counted per signed-in person (and per shared office address).
- [x] Render/Vercel deploys: additive, re-runnable SQL in `scripts/predeploy/` runs before
      `prisma db push` (still never `--accept-data-loss`).
- [x] Light / Dark / System theme in the header on every page (and on sign-in), remembered per
      device, applied before paint; Profile page has the same choice.
- [x] Sidebar: organisation wordmark styled like the printed document header; animated
      "Powered by EJO 100" with the platform mark.
- [x] Users: profile cards (avatar, active status, employee ID, roles); add-staff form starts
      empty with type-to-search branch / department / role; "Send the welcome email again".
- [x] Employee IDs issued by the server: ORG-BRANCH-NNNN (e.g. KN-ISO-0007), unique, never
      reused; one button issues IDs to existing staff without one.
- [x] Welcome email: employee ID, roles, organisation / branch / department, exactly what they
      can do (from the catalogue, added grants marked), how to sign in (72-hour set-password
      link), the rules. Access-changed email on every role given / removed and every permission
      added to / removed from a role they hold.
- [x] My Profile: details, what I can do, the rules, theme, change password (other devices
      signed out).

---

## Phase 4 — Authorization & cross-organisation attack audit (done)
Principle: **what you are supposed to see is what you see** — and nothing else, by any route.
For every role: login → menu → page → record → action → server action → database → audit →
notification → realtime.

Order of attack surfaces:
1. Refunds (`getRefundPosition`, `listRefunds`, `getRefund` only checked sign-in — found in Phase 3)
2. Payments and finance reads
3. Every read that takes a record id (direct-URL / guessed-id attacks), all modules
4. Cross-organisation and cross-branch reads and writes
5. Search (can see → can open → can act; nothing appears in search that its page would refuse)
6. Exports and prints (`/print/*`)
7. Notifications and realtime (audience is fenced; realtime is a ping only)
8. Analytics and dashboard figures (scoped to organisation → branch → role)
9. Staff / user / role administration (privilege escalation)
10. Customers and vehicles
11. Inactive users, multi-role users, department / assigned / own scope
Deliverable: fixes + a source test that fails CI if a read by id is not fenced.

**Found and fixed in this phase (PR #6):**
- Refund register and refund receipts showed every organisation's refunds → fenced.
- Vehicles-in-custody list showed every organisation's Job Cards → fenced.
- ~45 reads by id (payments, estimates, requests, audit trails, inspection, sourcing needs,
  part / goods-receipt / slip / outside-purchase pages, vehicle history and analytics) only
  checked "signed in" → each checks its record.
- Security desk actions (check-in, gate out / in, incidents, deliveries, contractors, vehicle
  exit, follow-ups) did not check the record's branch → fenced; actions on one's own items
  (edit / cancel a booking, decide / cancel passes and road tests, revoke a contractor pass)
  → must be in the person's organisation.
- **Anyone signed in could change their own organisation** through the auth library's
  update-user endpoint → field locked and the endpoint switched off.
- Overdue-service "attended", stop tracking, hand-back of a cancelled service, inspection items,
  sourcing needs → each checks its record.
- Collection reminders could be sent by anyone signed in → front desk only (button hidden otherwise).
- Store branch lookup was not organisation-aware → per organisation.
- Staff lists (names, emails) were given for any branch id → own organisation only.
- "Needs your action" read the newest 40 items platform-wide then filtered → per person and
  reach in the database (no action silently lost on a busy day).
- Meeting rooms, announcements, recent goods receipts, broadcast delivery figures → own organisation.
- **Public sign-up was open** for staff and customer accounts → closed.
- **Deactivated staff kept access** → refused at sign-in and on every request; switching off
  signs the person out everywhere.
- New: **Users → Add a staff member** (set-your-password email, own organisation / branch,
  never an administrator role from a branch) and **Switch off / Switch back on** (with reason,
  never yourself, never the platform owner, never the last active Administrator; a Branch
  Administrator never switches off an administrator).
- The API guard also refuses switched-off accounts; the customer sign-in no longer follows
  outside "redirect" links.

Still to do in this phase family (next PRs): notification "needs your action" caps of 10 per
kind (Phase 7), customer-portal direct-id tests once its pages exist (Phase 5).

## Phase 5 — Finish unfinished surfaces (customer portal done in #11)
Found by inventory on 7 Oct 2026 (pages that are placeholders today):
- ~~Staff Profile~~ — done in #7 (details, access, change password, theme). Still to add:
  sessions list, notification preferences.
- **Settings** — for every setting: who may change it, what it affects, its scope, audited,
  validated, cannot break a workflow. No setting hidden behind a generic "admin" assumption.
- **Customer Portal** (website app; today: login + dashboard) — a **controlled invitation flow**
  (staff invite a customer of a real job; no open sign-up), mobile-first, own sidebar;
  my vehicles → service history; estimates; payments and receipts; appointments / book a
  service; notifications; documents; **change and forgot password**; profile (extra phones /
  addresses, synced and audited); support / customer care; privacy; organisation isolation;
  direct-id attack tests. No employee name ever shown to customers.
- ~~Placeholder modules~~ — decided in #7: next version, hidden and their routes removed
  (see "Version 1 scope").
- Remaining idempotency: opening a Job Card / Vehicle Service gets an idempotency key.
- Stock reservation lifecycle: reserved → issued, or **automatically released** when the job is
  cancelled (with safeguards for stock already issued).

## Phase 6 — Analytics correctness & actionability (the heart of the platform)
Every card, chart, table, alert and widget gets an **Action Contract**:
`Metric → Source → Formula → Scope → Freshness → Permission → Insight → Action → exact record`.
If it says something needs attention it must answer *what exactly to do and where exactly to do it*
— a link to the exact record, never just "go to Warranty".
- **Descriptive** (what happened): revenue gross / net, payments, refunds, outstanding, partial,
  cancelled (never counted as revenue), jobs opened / assigned / in progress / completed /
  cancelled, turnaround, technician and supervisor workload, estimate conversion; stock on hand,
  reserved, available, incoming, issued, consumed, value, low stock, movements; warranty claims
  and values and turnaround; visitors, exits, passes, road tests, deliveries, incidents,
  contractors; appointments, utilisation, cancellations, room usage; branch comparisons,
  period comparisons, working-day maths.
- **Diagnostic** (why): drill-down that always ends at the underlying record
  (profit ↓ → revenue ↓ → branch → category → the actual jobs).
- **Trend / statistical**: honest trends and comparisons; no pretend ML.
- **Predictive / prescriptive readiness**: keep the history the future models need (demand,
  depletion, workload, revenue, warranty risk, unusual money activity, bottlenecks); every
  recommendation is an action link.
- **Inventory analytics**: reorder point and safety stock (descriptive → prescriptive, charts),
  synced with purchase / sales history and the Pricing Command Centre.
- Every figure reconciles against its records (tests that recompute it from raw rows).
- Everything live: figures update as work happens (no stale screens).

## Phase 7 — Notifications, email, realtime & scheduler
- A **matrix of every event × every role**: who gets an in-app notification, who gets an email,
  what the success / rejection / update feedback says, and the exact link. Covers Job Cards
  (created, supervisor assigned, approved / rejected, technician assigned / accepted / rejected,
  estimate steps, payments, parts, close / cancel), Vehicle Service, service tracker, custody
  and service-custody reminders, Store, procurement, refunds, warranty, security, scheduling,
  broadcasts.
- Check: missing / wrong / duplicate recipient, notice after a failed or rolled-back action,
  cross-organisation notice, stale or broken link, email vs in-app agree.
- "Action required" always opens the exact action.
- Realtime: reconnect, duplicates, stale and deleted records, branch / organisation filters,
  permission change, user deactivated, unsaved forms protected, fallback refresh.
- Scheduler: timing and timezone (Africa/Lagos), no duplicates, missed-run recovery,
  failures visible on Settings, never creates duplicate business records.

## Phase 8 — Data lifecycle
- **Recycle Bin**: delete = soft delete with a required reason; organisation restores; purge is
  separate, platform-team only, in monthly maintenance; records that took money are cancelled,
  never deleted; everything audited.
- History views that never lose anything but never become one long page: recent items first,
  "view more", paged full history (Job Card trail pattern) — applied to batches (a finished
  batch moves to history while the next continues), stock movements, vehicle pages, customer
  pages, part pages, audit trails.
- Documents and exports: fenced like their pages, consistent headers.

## Phase 9 — Look & feel
- **Light and dark mode** on every screen and component, strictly from the shared colour tokens
  (status colours included) — nothing mixed, nothing invisible in either mode; prints stay light.
- **Header branding**: organisation logo and name in the top bar sized like the document /
  print headers (not oversized).
- **"Powered by EJO 100"**: the animated presentation (motion, live effect) on the login screen
  with the platform logo; a quiet line elsewhere.
- Vehicle, customer, part and other record pages made easy to read: summary first, sections,
  view more / view less.

## Phase 10 — End-to-end journeys & unpredictable users
Full journeys, not single modules:
- Customer service: customer → vehicle → appointment → Job Card → technician → inspection →
  estimate → approval → parts → payment → work → completion → notifications → customer portal
  → analytics.
- Warranty: vehicle → warranty → claim → approvals → provider → money → notifications → analytics.
- Procurement: need → PRS / EPR → approvals → Finance → purchase → goods receipt → stock → audit → analytics.
- Security: booking → arrival → gate → host → visit → exit → audit → security analytics.
- Unpredictable users: double clicks, back button, two tabs, stale pages, dropped connections,
  wrong order of steps, cancelled half-way, role changed mid-task, deactivated mid-session.

## Phase 11 — Production reliability
Load and pressure tests on the critical paths, slow-query review, indexes, error reporting,
uptime checks, backup restore drill, runbooks. Application-level concurrency tests through the
real server actions (Phase 3 tested the SQL patterns). Journal "before" values inside
transactions. Move the schema push off Render (Vercel or a GitHub Action).

## Phase 12 — Final enterprise readiness audit
The complete loop, proven per module:
`Identity → Authorization → Organisation → Branch → Workflow → Transaction → Database → Audit →
Event → Notification → Realtime → Analytics → Action link → user completes the action`.
Plus a written map of the wiring — front end → server actions / API → database — one structured
tree, every connection traceable.

---

## Carried-over requests (kept so none is forgotten)
- Warranty: visibility on estimates / Job Card / Vehicle Service / PRS prints and emails;
  category-level defaults; supplier warranty at goods receipt; bulk import of sold vehicles;
  later a Vehicle Sales (Afprint) module.
- Estimate approval "version token" (manager approves exactly what they saw).
- Platform-wide uniqueness to revisit for multi-organisation: customer email, vehicle plate /
  chassis, provider name, policy code.
- New branches are recognised within 5 minutes (cache) — acceptable, documented.
- API organisation routes are platform-team only — acceptable, documented.
- Customer reminders stay semi-automatic (system says when, staff click Send).
- No employee names in customer-facing emails or prints.
- All reminder / grace timing in working days (Mon–Fri, Lagos).
- Notification channels: email + in-app now; SMS / WhatsApp later.

## Standing rules (unchanged)
- Never push to `main`; branch → PR → CI → preview → owner merges. No zips when pushed.
- Production database changes only by production deploy, never with data loss; SQL scripts are
  additive and re-runnable.
- `CRON_SECRET` and `PLATFORM_OWNER_EMAIL` never in code or chat.
- Documentation describes only what exists. Never claim the system is "unhackable".
