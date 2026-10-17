# EJO 100 — Enterprise Readiness: gap analysis, Stage 1 evidence and staged plan

> Status, 17 October 2026: **Stage 1 of 4 delivered** on branch `platform/enterprise-stage1`.
> EJO 100 is **not** yet "enterprise-ready" in the full sense of the specification. Section 9 lists what
> must not be claimed until it is proven. Everything below is either verified in code and tests, or is
> listed as a gap with an owner.

Companion documents: `ARCHITECTURE_BASELINE.md` (the binding rules), `ROLES_AND_ACCESS.md` (what each
person sees), `RUNBOOKS.md` (operations), `PRODUCTION_READINESS.md` (Phase A record), `SUPPORT_CENTRE.md`.

---

## 1. Audit before implementation: the system as it is

| Area | What exists today (verified) | Gap against the specification |
|---|---|---|
| **Hierarchy** | Organisation (tenant) → Business unit → Branch → Department → Team. Every query is fenced by organisation; branch reach comes from the user's branch plus `orgBranchIds`. | No **Group**, **Company**, **HQ** or **Region** levels. A group of companies is run today as one organisation with business units. |
| **Role assignment** | 22 roles, 55 permissions, five scopes (`ALL`, `BRANCH`, `DEPARTMENT`, `ASSIGNED`, `OWN`). Organisations can add grants on the Roles page; defaults are reviewed code (`lib/authz/catalogue.ts`). | A `UserRole` is not scoped to a branch or company: one person cannot be "Manager in Lagos, read-only in Abuja". Extra database grants are forced to `BRANCH`. |
| **Approvals** | 11 approval permissions; each step is compare-and-set (two people can't both approve); supervisor ≠ final approver on estimates. **Stage 1:** separation of duties on parts requests and outside purchases (section 3). | No amount-based **approval limits** (e.g. a manager up to ₦500,000, a director above). No **delegation with expiry** except assisted sessions. No **break-glass** emergency access. |
| **Identity** | Better Auth with email + password, 7-day sessions refreshed daily, sign-in limited per address (20/min), reset limited (5 per 5 min), password reset revokes all sessions, deactivation deletes sessions, assisted sessions recorded. | No **MFA**. No **account lockout** after repeated failures (only rate limiting). No **SSO** (Microsoft 365 sign-in is last on the plan by agreement). Rate limits are in memory, **per server instance**. |
| **Tenant isolation** | Application fence on every read and write (`tenant-coverage` and `guard-coverage` tests fail the build if an action skips it); IDOR, anonymous and cross-organisation e2e suites. RLS default-deny blocks Supabase's REST roles. | The app connects as the database owner, so RLS is **not** a second wall for the app itself; isolation lives in application code (tested, but one layer). |
| **Audit** | Every change writes `audit_logs` (who, what, record, before/after for data changes) stamped with the organisation; refused attempts are logged as `access.denied`. **Stage 1:** the table is append-only in the database. | The trail is not yet shipped to an external store, so a database owner could still disable the trigger. |
| **Observability** | Error references shown to people and stored (`error_events`, 90 days), System health with the database version, scheduled-job run records, IT dashboard. **Stage 1:** each error reference is logged with the request id. | No central log store, metrics or alerting beyond email. Correlation ids are not yet on every log line (only error lines). |
| **Jobs** | pg_cron / Vercel cron calls protected endpoints; each run recorded; lateness shown. | No queue with **retries** and dead letters; a failed run waits for the next schedule. |
| **Scalability** | Stateless web apps (Vercel fra1), Postgres in Frankfurt, indexed queries, compare-and-set concurrency, idempotency keys on payments/refunds/goods receipts. Every pull request runs a k6 staged load test (smoke → baseline → ramp → spike → soak → recovery) and kills one of two instances mid-test, against a throw-away CI database (`security.yml`). | Lists mostly capped with `take: 500` rather than paged. No load test against a production-sized staging environment yet, so no capacity figure can be quoted. |
| **Storage** | Images and documents stored with the records they belong to. | The API's object-storage module is a placeholder: no bucket, virus scan or signed URLs yet. |
| **Migrations** | `prisma db push` on Render with additive-only predeploy/postdeploy SQL, a schema-upgrade CI job, System health showing the version. | Not **versioned migrations**: no migration history table, no down-scripts. Additive-only rules make rollback by redeploying the previous code safe, but this must be stated, not assumed. |
| **Backups** | Supabase daily backups (plan-dependent). | **No restore drill on record.** RPO/RTO not agreed. |
| **Dashboards** | Role dashboards; **Stage 1:** leadership overview and IT overview with "figures as of" time stamps. | No CSV/Excel **exports**, no saved filters, no per-tile freshness indicator. |
| **Modules** | Workshop, store, procurement, warranty, gate security, CRM, support centre, scheduling, analytics, Enyo. | No HR/payroll, sales or budgets modules. No JusTech Control Centre (platform-level console across tenants). |

---

## 2. Architecture and data flow

```mermaid
flowchart LR
  subgraph People
    S[Staff browser]
    C[Customer browser]
    M[Email senders]
  end
  subgraph Vercel_fra1[Vercel · Frankfurt]
    P[apps/portal<br/>Next.js · server actions<br/>authorize() + org fence]
    W[apps/website<br/>public site + customer portal]
  end
  subgraph Render
    A[apps/api · NestJS<br/>audit interceptor]
    D[Deploy: predeploy SQL → db push → postdeploy SQL]
  end
  DB[(Supabase Postgres · Frankfurt<br/>RLS default-deny for REST roles<br/>audit_logs append-only)]
  LLM[LLM provider<br/>Enyo]
  WEB[Web search<br/>Serper/Brave/Tavily or DuckDuckGo]
  SMTP[SMTP / IMAP mailboxes]

  S -->|HTTPS, session cookie, x-request-id| P
  C -->|HTTPS| W
  P --> DB
  W --> DB
  A --> DB
  D --> DB
  P -->|tools only, after authorize()| LLM
  W -->|public facts only| LLM
  LLM -. look-ups .-> WEB
  M -->|IMAP read by scheduled job| P
  P -->|notifications, replies| SMTP
```

**A request, end to end.** The middleware gives every request an id (`x-request-id`, returned to the
browser too) and sets the security headers and nonce CSP. The page or action reads the session, then
`authorize(permission, record)` decides from the role grants and scope; the query carries the
organisation fence. Changes are compare-and-set where two people could race. The change writes the audit
row; notifications go out after the response (`after()`), so a slow mail server never delays the person.
If anything fails, the person sees a plain message with a reference; the reference is stored and logged
with the request id.

**Enyo (the assistant)** never decides access: each tool calls `getPrincipal()`/`authorize()` itself and
returns only what the person could open on screen. Drafts are never submitted on their own.

---

## 3. What Stage 1 changed, with evidence

| Change | Where | Evidence |
|---|---|---|
| Separation of duties, parts requests: the requester never gives the HOD approval; the requester or HOD approver never gives the Store approval. | `lib/actions/sourcing.ts` (`approvePartRequestSlipByHod`, `approvePartRequestSlipByStore`) | `tests/enterprise-controls.test.ts`; refusals are audited through `refuse()`; e2e lifecycle uses different people at each step and still passes. |
| Separation of duties, outside purchases: nobody reviews their own request; the requester or reviewer never approves it; the requester or approver never pays it out. | same file (`sendExternalProcurementToManager`, `approveExternalProcurementRequest`, `disburseExternalProcurementRequest`) | same test; the refusal happens before any change. |
| The screens say who must act instead of offering a button the server would refuse. | `workshop/parts-requests/[id]`, `workshop/external-procurement/[id]` | `data-testid="sod-note"`. |
| Integrity watch: the same Finance colleague reviewing and paying out is flagged (allowed, because a manager's approval sits between). | `lib/integrity/scan.ts` (`spa:epr-review-pay:`) | same test. |
| Audit trail append-only in the database (UPDATE, DELETE and TRUNCATE refused) with a transaction-scoped maintenance switch for a recorded retention step. | `scripts/postdeploy/0005-audit-log-append-only.sql` | same test; `mvp-polish` test forbids any postdeploy file that drops, deletes, truncates or disables a trigger. |
| Error references tied to request ids in the logs. | `lib/error-events.ts` | same test. |
| Notifications end to end: the person whose step it now is gets an email (section 6a). | `lib/workflow-notify.ts`, `lib/actions/{sourcing,workshop,support,security,users-admin}.ts`, `lib/auth.ts` | `tests/enterprise-controls.test.ts`, `tests/emails.test.ts` (sample of the new email). |
| Leadership overview (money this month, workshop now, decisions waiting and for how long, branches side by side, support) and IT overview (accounts, sign-ins and failures, errors, refused access, health checks), each with "as of" time. | `components/dashboard/*Overview.tsx`, `lib/actions/leadership.ts` | `tests/dashboards.test.ts`; e2e `role-experience.spec.ts` (executive, IT administrator, customer care: what each sees and is refused). |
| Support centre: owners emailed on assignment; team leads emailed when nobody is free or a request is late; each team's own automatic-reply text; Reply by email / Call / WhatsApp on each request; settings read first, edited on purpose. | `lib/support/notify.ts`, `settings/support/*` | `tests/support-realism.test.ts`, `tests/emails.test.ts`. |
| Enyo: free web search when no key is set, a "Test the web search" button for administrators, the organisation's published people answered first. | `packages/enyo/src/web.ts`, `settings/enyo` | `packages/enyo` tests (DuckDuckGo parsing). |
| Database version check extended to v39 (`support_queues.ackMessage`, `support_queue_members.isLead`). | `lib/schema-health-core.ts` | `tests/roles-support-leadership.test.ts`. |

Test runs for this branch: portal unit/static tests, Enyo engine tests, website tests, typecheck and lint
locally; CI (unit, e2e, security suites) on the pull request. Results are recorded on the pull request.

---

## 4. Role, permission and scope matrix

Scopes: **A** all of the organisation · **B** own branch(es) · **D** own department · **S** assigned to
them · **O** their own records. The source of truth is `apps/portal/lib/authz/catalogue.ts`; this table
is generated from it.

Approval permissions (each one a step that waits on a named person): `workshop.job.supervise`,
`workshop.estimate.approve`, `workshop.estimate.final_approve`, `workshop.close.approve`,
`store.prs.approve_hod`, `store.prs.release`, `procurement.epr.review`, `procurement.epr.approve`,
`procurement.epr.disburse`, `warranty.claim.approve`, `security.pass.approve`.

**The specification's 25 role profiles.** 22 exist as roles today. The profiles that depend on hierarchy
levels not yet built (group executive, company managing director, regional manager) and on modules not
yet built (HR, sales, internal audit read-only across companies) are Stage 2 and Stage 4 work; until
then a director is given `executive` within the organisation.

| Role | Permissions (scope) |
|---|---|
| **Organisation Administrator (headquarters)** (`administrator`) | `admin.organisation.manage`·A, `admin.structure.manage`·A, `admin.users.manage`·A, `admin.roles.manage`·A, `admin.settings.manage`·A, `audit.view`·A, `analytics.business.view`·A, `analytics.inventory.view`·A, `analytics.warranty.view`·A, `notifications.broadcast.send`·A, `workshop.view`·A, `workshop.job_card.view`·A, `store.view`·A, `warranty.view`·A, `security.view`·A, `schedule.view`·O, `crm.view`·A, `crm.manage`·A, `admin.recycle_bin.manage`·A, `enyo.manage`·A, `support.tickets.manage`·A, `support.manage`·A, `integrity.review`·A |
| **Branch Administrator** (`branch-administrator`) | `admin.users.manage`·B, `workshop.view`·B, `workshop.job_card.view`·B, `store.view`·B, `warranty.view`·B, `security.view`·B, `analytics.business.view`·B, `analytics.inventory.view`·B, `analytics.warranty.view`·B, `schedule.view`·O, `crm.view`·B, `crm.manage`·B, `admin.recycle_bin.manage`·B, `support.tickets.manage`·B |
| **Front Desk (Receptionist)** (`receptionist`) | `workshop.view`·B, `workshop.job_card.view`·B, `workshop.job_card.create`·B, `workshop.customer.manage`·B, `workshop.customer.notify`·B, `workshop.close.request`·S, `crm.view`·B, `crm.manage`·B, `support.tickets.manage`·B, `security.view`·B, `security.reception.operate`·B, `schedule.view`·O |
| **Workshop Supervisor** (`workshop-supervisor`) | `workshop.view`·B, `workshop.job_card.view`·B, `store.view`·B, `crm.view`·B, `workshop.job.supervise`·S, `workshop.technician.assign`·S, `workshop.estimate.edit`·S, `workshop.estimate.approve`·S, `workshop.inspection.perform`·S, `workshop.job.work`·S, `workshop.close.request`·S, `sourcing.request`·S |
| **Technician** (`technician`) | `workshop.view`·B, `workshop.job_card.view`·B, `store.view`·B, `workshop.job.work`·S, `workshop.estimate.edit`·S, `workshop.inspection.perform`·S, `sourcing.request`·S |
| **Workshop Manager** (`workshop-manager`) | `workshop.view`·B, `workshop.job_card.view`·B, `store.view`·B, `warranty.view`·B, `workshop.estimate.final_approve`·B, `workshop.close.approve`·B, `store.prs.approve_hod`·B, `procurement.epr.approve`·B, `warranty.manage`·B, `warranty.claim.approve`·B, `security.pass.approve`·B, `analytics.business.view`·B, `analytics.inventory.view`·B, `analytics.warranty.view`·B, `schedule.view`·O, `crm.view`·B, `crm.manage`·B, `support.tickets.manage`·B |
| **Finance Officer** (`finance-officer`) | `workshop.view`·B, `workshop.job_card.view`·B, `store.view`·B, `workshop.payment.record`·B, `workshop.refund.record`·B, `procurement.epr.review`·B, `procurement.epr.disburse`·B, `analytics.business.view`·B, `analytics.inventory.view`·B |
| **Store Manager** (`store-manager`) | `store.view`·B, `workshop.view`·B, `workshop.job_card.view`·B, `store.matching`·B, `store.parts.manage`·B, `store.grn.record`·B, `store.prs.release`·B, `analytics.inventory.view`·B, `security.pass.approve`·D |
| **Store Officer** (`store-officer`) | `store.view`·B, `workshop.view`·B, `workshop.job_card.view`·B, `store.matching`·B, `store.parts.manage`·B, `store.grn.record`·B, `store.prs.release`·B, `analytics.inventory.view`·B |
| **Warranty HOD** (`warranty-hod`) | `warranty.view`·B, `workshop.view`·B, `workshop.job_card.view`·B, `store.view`·B, `warranty.manage`·B, `warranty.claim.approve`·B, `analytics.warranty.view`·B, `security.pass.approve`·D |
| **Warranty Officer** (`warranty-officer`) | `warranty.view`·B, `workshop.view`·B, `workshop.job_card.view`·B, `store.view`·B, `warranty.manage`·B, `analytics.warranty.view`·B |
| **Department Head** (`department-head`) | `security.pass.approve`·D, `schedule.view`·O |
| **Chief Security Officer** (`chief-security-officer`) | `security.view`·B, `security.gate.operate`·B, `security.reception.operate`·B, `security.incident.manage`·B, `security.pass.approve`·D |
| **Security Officer** (`security-officer`) | `security.view`·B, `security.gate.operate`·B, `security.reception.operate`·B |
| **Calendar User** (`calendar-user`) | `schedule.view`·O |
| **Scheduling Admin** (`scheduling-admin`) | `schedule.view`·A, `schedule.manage`·A |
| **Broadcaster** (`broadcaster`) | `notifications.broadcast.send`·A |
| **Branch Assistant (IT support)** (`branch-assistant`) | `support.assist`·B |
| **Customer Care** (`customer-care`) | `support.tickets.manage`·B, `crm.view`·B, `workshop.view`·B, `workshop.job_card.view`·B, `warranty.view`·B, `schedule.view`·O |
| **Customer Care Lead** (`customer-care-lead`) | `support.tickets.manage`·A, `crm.view`·A, `crm.manage`·A, `workshop.view`·A, `workshop.job_card.view`·A, `warranty.view`·A, `analytics.warranty.view`·A, `schedule.view`·O, `security.pass.approve`·D |
| **Executive (director / general manager)** (`executive`) | `analytics.business.view`·A, `analytics.inventory.view`·A, `analytics.warranty.view`·A, `workshop.view`·A, `workshop.job_card.view`·A, `store.view`·A, `warranty.view`·A, `security.view`·A, `crm.view`·A, `schedule.view`·O, `security.pass.approve`·D |
| **IT Administrator** (`it-administrator`) | `admin.users.manage`·A, `admin.roles.manage`·A, `admin.settings.manage`·A, `admin.structure.manage`·A, `audit.view`·A, `enyo.manage`·A, `schedule.view`·O |

---

## 5. Threat model (summary)

| Threat | Control in place | Residual risk / next step |
|---|---|---|
| Another organisation's data read or changed (IDOR, tenant crossing) | Organisation fence on every query; record checks; build fails if an action skips them; cross-org e2e | One layer (application). Stage 3: app connects as a non-owner role so RLS becomes a second wall. |
| Privilege escalation (giving yourself a role) | Role changes need `admin.users.manage`, audited; platform-only permissions can't be granted by an organisation | No four-eyes on role grants. Stage 2: second approval for administrator grants. |
| Self-approval / collusion on money | Supervisor ≠ final approver (estimates); Stage 1 separation of duties on PRS and EPR; integrity watch | No amount limits. Stage 2. |
| Password guessing | Per-address limits on sign-in and reset; failed sign-ins shown on the IT dashboard | No MFA, no lockout, limits per instance. Stage 2 (MFA, lockout) and Stage 3 (shared limiter / WAF). |
| Session theft | HTTP-only cookies, nonce CSP, security headers, sessions revoked on reset/deactivation | MFA would limit the damage of a stolen password. |
| Tampering with the audit trail | Append-only trigger (Stage 1) | A database owner can disable triggers. Stage 3: ship the trail to an external store. |
| Prompt injection through Enyo | Tools re-check access themselves; Enyo is never an authorisation authority; drafts never auto-submit; web text treated as data | Keep red-team prompts in the e2e suite. |
| Personal data leaking into AI training | Training exports carry no personal data (data inventory test lists every model) | — |
| Secrets exposure | Secrets only in hosting settings; never in the repo or chat; gitleaks over the full history, client-bundle scan for secrets and env names on every pull request | — |
| Known vulnerable code or packages | Semgrep project rules (fail the build), npm audit, OWASP ZAP baseline on portal and website on every pull request | A penetration test by a third party (Stage 4). |
| Losing data | Additive-only schema rules; Supabase backups | No restore drill on record (owner below). |

---

## 6. Dashboard KPI specification

| Dashboard | Who | KPI | Definition | Freshness |
|---|---|---|---|---|
| Leadership | `analytics.business.view` (executive, administrator, managers within reach) | Sales this month | Work finished this month at selling price, vs the same days last month | As of page load |
| | | Gross profit, margin | Sales less parts cost | |
| | | Money collected | Payments less refunds this month | |
| | | Jobs finished, average job | Job Cards completed this month | |
| | | Owed on finished jobs | Balance on completed jobs not yet paid | |
| | | Month projection | Pace so far projected to month end, vs last month | |
| | | In the workshop now | Job Cards and services in custody, ready to collect, waiting for parts, waiting for the customer | |
| | | Median turnaround | Check-in to check-out, last 30 days | |
| | | Decisions waiting | Count and oldest age per approval queue (estimates, parts, outside purchases, warranty claims, exit passes); 2 days or more is flagged | |
| | | Branches side by side | In now, ready, opened and collected this month per branch | |
| | | Support | Open, past target, without owner, satisfaction (30 days) | |
| IT | `audit.view` + `admin.users.manage` (IT administrator, administrator) | Accounts | Active, switched off, never signed in | As of page load |
| | | Sign-ins | Successful and failed in 24 h; accounts with 5 or more failures | |
| | | Errors | 24 h and 7 days; latest 5 references | |
| | | Access | Refused attempts 24 h; role and permission changes 7 days | |
| | | Health | Database version, scheduled jobs on time, Enyo connected, support mailboxes reading | |

Next (Stage 2): CSV export on each table, filters (branch, period) kept in the address bar, and a
per-tile "updated" time where a tile is cached.

---

## 6a. Notifications: who hears what (Stage 1 audit and fixes)

The bell shows each person the audit entries that concern them (their records, their area, their
approvals). Email is the alert. Stage 1 audited every step that waits on a person and fixed the gaps:

| Step | Emailed (after Stage 1) |
|---|---|
| Job Card created / approved / assigned / accepted | Supervisor; creator; technician; supervisor (as before) |
| Estimate submitted → supervisor → manager → customer | Supervisor; branch Managers; creator; customer (as before) |
| **Estimate sent back by the manager** | **Supervisor and technician** (new) |
| **Job reaches quality check** | **Supervisor, or the branch Managers when there is none** (new); customer |
| **Sent back for rework** | **Technician** (new); customer |
| Close requested / approved / declined, checkout | Managers; everyone on the job; requester; gate and customer (as before) |
| **Supervisor replaced** | New supervisor; **the previous supervisor** (new) |
| Parts request raised → HOD → Store → release / rejection | Branch Managers; Store; technician and supervisor; **whoever raised it** (new); **the HOD when the Store rejects** (new) |
| Outside purchase raised → Finance → Manager | Finance; Managers; technician and supervisor; **whoever raised it** (new) |
| **Outside purchase approved** | **Finance, to pay it out** (new) — never the person who raised or approved it |
| **Outside purchase turned down by the manager** | **The Finance colleague who reviewed it** (new) |
| Warranty claim | HODs and Managers in parallel (by design: either may approve first); creator on the outcome |
| Exit pass raised → head → manager | Head; Managers; **requester when the head authorises** (new); requester and gate on approval |
| Support request assigned / nobody free / late | The new owner; team leads (or support managers); owner and leads |
| **Support request moved to another team** | **That team's next free colleague, or its leads** (new) |
| **Support request given to someone else** | New owner; **the previous owner** (new) |
| Account created, roles or permissions changed | The person (as before) |
| **Account switched back on** | **The person** (new) |
| **Password set or changed** | **The person — a security notice** (new) |

Every new email goes through one helper (`lib/workflow-notify.ts`): never the person who acted, only
active colleagues of the same organisation, and a failed email never stops the work.

---

## 7. Hierarchy and migration plan (Stage 2)

1. **Add, never rename.** New tables `groups`, `companies`, `regions`; nullable `companyId` on
   business units and `regionId` on branches; HQ is a flag on a branch. Existing rows stay valid with nulls.
2. **Scoped assignments.** New table `user_role_assignments (userId, roleId, scopeType, scopeId,
   validFrom, validUntil, grantedBy)`. The current `UserRole` keeps working; the decision function reads
   both, and the narrower wins.
3. **Approval limits.** `approval_limits (organisationId, permission, roleId, maxAmount, currency)`;
   approvals above a person's limit go up a level.
4. **Delegation.** `delegations (fromUserId, toUserId, permission, until, reason)`, expiring
   automatically, audited, shown on both people's dashboards.
5. **Break-glass.** A time-boxed grant needing two administrators, alerting leadership and IT, every
   action audited.
6. Each step ships behind the existing tests plus new ones for scope, expiry and limits.

---

## 8. Deployment, rollback, backup and recovery runbook

**Deploy order (every release that changes the schema):**
1. Merge the pull request when CI is green.
2. **Render first.** The API deploy runs predeploy SQL → `prisma db push` → postdeploy SQL. Wait for
   `[db-push] Done.` in the Render log.
3. Then Vercel (portal and website). If the web apps go first, pages that read new columns fail until
   step 2 finishes.
4. Check **Settings → System health**: the database version must say **v39**; scheduled jobs on time.
5. Smoke test: sign in, open a Job Card, open the Support centre, ask Enyo a question,
   **Settings → Enyo → Test the web search**.

**Rollback:** redeploy the previous Vercel and Render builds. Because every schema change is additive,
older code runs on the newer database; nothing is dropped, so no data is lost. Never use
`--accept-data-loss`.

**Audit retention (only if ever required):** in one transaction,
`SET LOCAL ejo.audit_maintenance = 'on';` then the recorded deletion, approved in writing. The switch ends
with the transaction.

**Backup and recovery:** see `RUNBOOKS.md` §4. The restore drill has **not** been done yet; it is a
blocker for any claim of recoverability (section 10).

---

## 9. Must NOT be claimed yet

- "Enterprise-ready" or "SAP-equivalent" as a whole.
- Multi-factor authentication, single sign-on or account lockout.
- Group / company / region hierarchy, or roles scoped per branch or company.
- Amount-based approval limits, delegation with expiry, emergency access.
- Versioned migrations, or a tested backup restore with a measured RPO/RTO.
- A capacity figure (users or requests per second): CI load tests run on a throw-away database, not a production-sized staging environment.
- Tamper-proof audit trail (append-only in the database; not yet shipped to an external store).
- Exports, HR/payroll, sales, budgets, the JusTech Control Centre.

What **can** be claimed, with evidence: organisation isolation tested on every action and in e2e;
segregation of duties on estimates, parts requests and outside purchases; every change audited, the
trail append-only in the database; idempotent payments, refunds and goods receipts; compare-and-set on
every approval; additive-only schema with a version check; role dashboards with "as of" times.

---

## 10. Staged plan, owners and blockers

| Stage | Contents | Owner | Blocked on |
|---|---|---|---|
| **1 (this branch)** | Separation of duties (PRS, EPR), append-only audit, request ids in error logs, leadership and IT dashboards, support notifications and view/edit settings, Enyo web search | JusTech engineering | — |
| **2** | MFA (TOTP) for administrators then everyone; lockout after repeated failures; approval limits; scoped role assignments; delegation with expiry; exports; Group/Company/Region hierarchy | JusTech engineering | Kewalram to confirm the hierarchy (companies, regions) and approval limits per role |
| **3** | Shared rate limiter / WAF; job queue with retries; object storage with scanning; app connecting as a non-owner database role; audit shipped to external storage; versioned migrations | JusTech engineering + Kewalram IT | Hosting plan decisions (Supabase plan, Vercel/Render plan) |
| **4** | Backup restore drill with measured RPO/RTO; load test on staging; penetration test; HR/sales modules; Control Centre; Microsoft 365 sign-in (last, by agreement) | Kewalram IT (drill, pen test), JusTech | A staging environment (`RUNBOOKS.md` §3) |
