# EJO 100 — Architecture & Security Baseline v1

**Status:** binding from 6 October 2026. Every pull request is reviewed against this
document (see `.github/pull_request_template.md`). Changing a rule here is itself a
reviewed change. Where something is not built yet it says **Planned**.

The one question for every change: **which of these invariants does it touch, and how
does it keep them?**

---

## 1. Identity
- People sign in through Better Auth (sessions in the database, HTTP-only cookies, 7-day
  sessions, rate-limited sign-in). The portal and the API trust the same session table.
- Every server action calls `requireUser()` first; every database write in that request is
  attributed to that person (`setAuditActor`), including their organisation.
- An account with no organisation sees nothing of substance until an administrator places it.

## 2. Organisation model (tenancy)
```
Platform (EJO 100 team) ─┬─ Organisation (e.g. Kewalram) ─┬─ Business unit ─ Branch ─ Department ─ Team
                         └─ Organisation …               └─ People, roles, customers, providers, policies
```
- **Platform team** = holders of the Master Administrator role. Invisible to organisations
  (shown as "Platform support"); the owner account (`PLATFORM_OWNER_EMAIL`) can only be changed
  by the owner; a database trigger (v22) blocks granting the Master role outside a marked transaction.
- **Tenant fence:** `decide()` refuses any record whose branch is outside the person's
  organisation — before any scope, ALL included. Lists use `reachWhere` (branches of the
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
| Workshop Manager | Branch | Final approvals, close/cancel, PRS/EPR approvals, passes — never opens jobs |
| Finance Officer | Branch | Payments, refunds, EPR review and cash |
| Store Manager / Officer | Branch | Parts, prices, stock, receipts, releases, deliveries |
| Warranty HOD / Officer | Branch | Warranties, claims (HOD approves) |
| Chief Security / Security Officer | Branch | Gate, visitors, incidents (Chief) |
| Department Head | Department | Approves their department's exit passes |
| Calendar User / Scheduling Admin / Broadcaster | Own / all | Calendars, rooms and aides, broadcasts |
| **Everyone** | Own | Request their own exit pass — nothing else by default |

Defaults are reviewed code (`lib/authz/catalogue.ts`); headquarters may **add** a catalogue
permission to a role on the Roles page. A person with several roles gets the widest grant.

## 4. Permission model
`PERMISSIONS` in the catalogue is the only list of things that can be done (47). A permission
with no code enforcing it may not exist; the Permissions page is generated from the same code.

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
- **Never:** trust a browser-supplied id, branch, role or price; hide a button as protection.
- **CI:** `tests/guard-coverage.test.ts` fails if any data-changing server action has no check.

## 7. Tenant isolation rules
1. Every new table is declared in `lib/governance/data-inventory.ts` (CI enforces it).
2. A BRANCH table carries `branchId`; an ORGANISATION table `organisationId`; a child reaches
   its tenant through a declared parent column.
3. Every read of tenant data goes through `reachWhere` / `orgWhere` / `orgOwned` or a record
   check. Every create stamps the owner (`myOrganisationId`, the operating branch).
4. Emails, notifications, search, analytics, exports and realtime obey the same fence.
5. Audit rows carry `organisationId`, stamped centrally in the database layer.

## 8. Data classification & lifecycle
The data inventory declares, for every table: **tenancy, owner column, classification**
(INTERNAL · PERSONAL · FINANCIAL · SECURITY · SECRET · AUDIT), **lifecycle** (state machine ·
immutable · archive · cascade · expires · platform delete), **retention**, and **AI access**.
- Financial records (payments, refunds, goods receipts) and the audit trail are **immutable**.
- Business records end through their **workflow** (cancel / close with approval), not deletion.
- **Planned — Recycle Bin:** a deletion flag with a reason; hidden everywhere; restorable by
  headquarters; permanently purged only by the platform team after the retention period.
  Records that took money are cancelled and refunded, never deleted.

## 9. Audit rules
- Business events: `writeAuditLog` (plain-language actions). Every data change: the database
  journal (before/after, secrets redacted). API requests: logged with status and duration.
- Nothing in the audit trail is ever edited or deleted. Scheduled-job runs are kept in their own
  view so they never bury people's work.

## 10. Realtime rules
A realtime ping carries **no data** — only "something changed". The browser then re-reads through
the same authorization. Caches and realtime are accelerators, never authorities.

## 11. Event rules
Every meaningful business change writes a named audit event (`job_card.approved`, `payment.recorded`
…). Notifications, the activity feed, analytics and — later — integrations and AI consume these
events. **Planned:** a typed event catalogue as the formal contract; no message broker until load requires one.

## 12. Transactions & concurrency
- Workflow steps use **compare-and-set** (`updateMany` with the expected status; 0 rows = someone
  else got there first → friendly message).
- Money uses **idempotency keys** (unique in the database) so a double click records once.
- Multi-row changes run in a **transaction**; stock movements are recorded as immutable consumptions.
- **Planned (next integrity phase):** a systematic audit of every stock and money path for
  races (row locks / conditional decrements), with tests.

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
draft — always as the person using it, through the same `authorize` / `reachWhere` tools — and
only data whose inventory entry allows AI. A human approves every action; the workflow, the
fence and the database decide whether it commits. SECRET data is never available to AI.

## 17. Testing strategy
Pure decision tests (allowed **and** denied) for the catalogue; guard-coverage and data-inventory
tests read the source; TypeScript strict; lint; a full production build — all in CI on every push
and pull request. **Planned:** database-backed cross-organisation tests on a staging copy.

## 18. Deployment
Pull request → CI → Vercel preview (never touches the database) → merge → production deploy
(`prisma db push` without data loss) → reviewed SQL scripts (`scripts/vNN-*.sql`, additive,
re-runnable) when data must be filled.

## 19. Observability
Structured JSON error logs with a reference number shown to users; every scheduled job recorded
and shown on Settings with email-delivery health; refusals audited. **Planned:** uptime and error
alerting.

## 20. Scaling triggers (only with evidence)
| Add | When |
|---|---|
| Redis / shared cache | Cache misses or rate limits need sharing across many instances |
| Queue + workers | Emails or jobs take long enough to slow a user's action |
| Read replica | Analytics queries measurably slow the live system |
| Region alignment | Paid plans allow app and database in one region |
| Service extraction / Kubernetes | A module needs independent scaling or release |
