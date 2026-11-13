# EJO 100: architecture

How the system is put together, for an engineer who has to read it, run it
or change it. This is the current overview. The binding rules, with their
full detail, are in [ARCHITECTURE_BASELINE.md](ARCHITECTURE_BASELINE.md);
where the two differ on a count or a version, this page and the code are
newer.

- [The three applications](#the-three-applications)
- [The database package](#the-database-package)
- [Repository layout](#repository-layout)
- [How a request flows](#how-a-request-flows)
- [Organisations, branches and the fence](#organisations-branches-and-the-fence)
- [Roles, permissions and scopes](#roles-permissions-and-scopes)
- [Audit trail and deletes](#audit-trail-and-deletes)
- [Workflow integrity](#workflow-integrity)
- [Scheduled work, email and realtime](#scheduled-work-email-and-realtime)
- [Modules, the menu and the roadmap](#modules-the-menu-and-the-roadmap)
- [Adding a module](#adding-a-module)
- [Changing the database](#changing-the-database)
- [Coding rules](#coding-rules)

## The three applications

| App | Who uses it | What it is |
|---|---|---|
| `apps/portal` | Staff | The staff portal. Next.js App Router. Pages are server components. Every write is a server action in `lib/actions/*` that authorises and then calls Prisma directly. |
| `apps/website` | The public and customers | The organisation's public website (its own brand) and the customer portal under `/customer-portal`, with a separate customer sign-in. |
| `apps/api` | The platform team | NestJS. A health check and read-only platform routes behind `PlatformTeamGuard`. No business workflow depends on it. |

A fourth part, `ml/`, is a Python package that trains the models behind
Enyo's predictions (parts demand, job time and others). It runs in GitHub
Actions, not as a server, and has no database credentials: it reads a
de-identified export from the portal and hands back model files. See
[ML.md](ML.md).

The portal does not call the API for business work. Server actions give one
place to authorise, validate, write and audit, so the API stayed thin.

```
staff browser ──► portal ──Prisma──► PostgreSQL ◄──Prisma── website + customer portal ◄── customer browser
                    │  ▲                 ▲                          │
                    │  └── scheduled     └──Prisma── API            └──► SMTP
                    ├──► SMTP                (platform team only)
                    └──► realtime ping ("something changed", no data) ──► staff browsers
```

## The database package

`packages/database` (imported as `@ejo/database`) holds:

- `prisma/schema.prisma`: every table. PostgreSQL 16.
- `src/index.ts`: the one shared Prisma client.
- `src/audit-journal.ts`: records every write with its before and after
  values (secrets redacted; a transaction that rolls back leaves no entry).
- `prisma/seed.ts`: the first organisation, its roles and the platform
  administrator.

All three applications use this package. There is no second path to the
database.

## Repository layout

```
ejo100/
├── apps/
│   ├── portal/                     staff portal (Next.js)
│   │   ├── app/(app)/<module>/     signed-in pages; a module's layout or page guards it (guardPage / guardAnyPage)
│   │   ├── app/(auth)/             sign-in, forgot and reset password
│   │   ├── app/print/              printable documents (same record checks as the pages)
│   │   ├── app/api/                auth, health, live pulse, search, scheduled jobs
│   │   ├── lib/actions/            server actions ('use server'); *-form-handlers.ts adapt forms to them
│   │   ├── lib/authz/              permission catalogue, enforcement, navigation
│   │   ├── lib/governance/         data inventory (every table declared)
│   │   ├── lib/data-exchange/      imports, exports, the cut-over checklist
│   │   ├── lib/sap/                the daily postings files for SAP
│   │   ├── lib/plant/              assembly plant rules: kits, the line, PDI
│   │   ├── lib/recycle-bin/        recoverable deletes
│   │   ├── lib/email-templates/    one file per email
│   │   ├── lib/*.ts                pure rules and helpers (analytics, reminders, integrity, calendars)
│   │   ├── components/             shared UI (components/ui for page building blocks)
│   │   ├── tests/                  unit and source-coverage tests (node --test)
│   │   └── e2e/                    Playwright specs, seed, security sweeps
│   ├── website/                    public website and customer portal (Next.js)
│   └── api/                        NestJS API
├── packages/
│   ├── database/                   Prisma schema, client, audit journal, seed
│   ├── enyo/                       the assistant's shared core (model client, tools, guardrails)
│   ├── ui/                         shared React components
│   ├── types/                      shared TypeScript types
│   ├── utils/                      framework-free helpers
│   └── config/                     design tokens for Tailwind
├── ml/                             Python training package for Enyo's models
├── scripts/                        deploy scripts; predeploy/ and postdeploy/ SQL; one-off reviewed SQL
├── ops/load-test/                  k6 scripts
├── docs/                           this folder
└── .github/workflows/              ci.yml, e2e.yml, security.yml, ml-train.yml
```

Code that two apps need goes in `packages/*` and is imported as `@ejo/*`.
Where the two apps need the same small helper with different runtime
dependencies (email, auth), each app keeps its own copy and the copies say
so in a comment.

## How a request flows

A staff member presses a button. This is what happens, in order:

```
browser
  └─► middleware.ts            sign-in cookie present; submission flood limit; security headers
        └─► page or server action
              requireUser()                 session read from the database; switched-off accounts refused
              authorize(permission, record) tenant fence first, then scope; a refusal is audited as access.denied
              workflow check                compare-and-set on the status the person saw; row locks for money and stock
              Prisma write                  the audit journal records before and after
              writeAuditLog(...)            the business event in plain words (who, what, which record)
        └─► after the response              emails, realtime ping; their failure never undoes the action
```

1. **Page.** A page under `app/(app)/<module>/` is a server component. It
   calls `guardPage('<permission>', '<path>')` before it reads anything.
   A person without the permission is sent to *Access denied*.
2. **Server action.** A form or button calls an exported function in
   `lib/actions/<area>.ts`. Each one starts with `requireUser()` and
   `authorize(...)` (or a named guard such as `authorizeOnJobCard`).
   `tests/guard-coverage.test.ts` reads the source and fails if a
   data-changing action has no check.
3. **Authorisation.** `lib/authz/server.ts` loads the person's roles,
   grants, branch and organisation once per request and calls the pure
   `decide()` function in `lib/authz/catalogue.ts`. Buttons use `allows()`,
   which is the same rule, so a hidden button and a refused action never
   disagree.
4. **Prisma.** Reads of a list go through `reachWhere` / `orgWhere`; reads
   of one record check that record (`seeOrNull`, `canSeeRecord`). Creates
   stamp the organisation and branch from the server, never from the form.
5. **Audit.** The journal in `packages/database` records the data change;
   `writeAuditLog` in `lib/workshop-core.ts` records the business event.

The website follows the same shape with its own customer session
(`apps/website/lib/auth-customer.ts`). Customer pages query by the
session's customer id, never by an id from the URL.

## Organisations, branches and the fence

```
Platform team ─ Organisation ─ Business unit ─ Branch ─ Department ─ Team ─ People
                            └─ customers, vehicles, warranty providers and policies (organisation-wide)
```

- One database holds many organisations. Nothing in code assumes a
  particular one: Kewalram, its division and its branches are rows created
  by the seed.
- **The tenant fence.** A record outside the person's organisation is
  refused before any scope is considered, including the widest one. Out of
  reach and missing look the same ("not found").
- **The branch fence.** Most records belong to a branch. A person scoped to
  a branch sees that branch's records only.
- **Branches have a kind** (`lib/branch-types.ts`): workshop, assembly
  plant, vehicle sales, head office or warehouse. Plant pages only ever
  show assembly-plant branches; job cards only live on workshop branches;
  parts and stock only load into a workshop or warehouse.
- Every table is declared in `lib/governance/data-inventory.ts` with its
  tenancy, owner column, sensitivity, lifecycle, retention and whether Enyo
  may read it. `tests/data-inventory.test.ts` fails if a table is missing.
- Staff and customers are separate identity systems: different tables and
  different cookies. A customer token cannot be used on the staff portal.

## Roles, permissions and scopes

- `PERMISSIONS` in `lib/authz/catalogue.ts` is the only list of things
  that can be done. The same file holds each role's default grants. The
  Permissions page, the Roles page and each person's "what I can do" are
  generated from it.
- Five scopes: `ALL` (every branch of the organisation), `BRANCH`,
  `DEPARTMENT`, `ASSIGNED` (the job's supervisor or technician, or the
  person who opened it) and `OWN`.
- Separation of duties is in the actions, not only in the roles: nobody
  approves their own request, a PDI is never approved by its inspector, a
  kit is never released by the person who checked it, an import is never
  approved by the person who prepared it.
- What each role sees and does is written out in
  [ROLES_AND_ACCESS.md](ROLES_AND_ACCESS.md).

## Audit trail and deletes

- Every data change is journalled with before and after values. Every
  business step is a named event (`job_card.approved`, `plant.gate_passed`)
  with the person and the organisation.
- Audit rows are append-only in the database
  (`scripts/postdeploy/0005-audit-log-append-only.sql`). They are not yet
  copied to a store outside the database.
- Business records end through their workflow (cancel, close, reject), not
  by deletion. Payments, refunds and goods receipts are never changed.
- **Recycle bin** (`lib/recycle-bin/`). A record made by mistake, with
  nothing of consequence on it, is moved to the bin and can be restored
  whole for a set period (`RECYCLE_BIN_DAYS`, 30 by default). Undoing an
  import also moves what it added to the bin.

## Workflow integrity

Two tools, in `lib/integrity.ts`:

- **Compare-and-set.** A status change includes the status the person saw
  in its `where`. If someone else acted first, nothing is written and the
  person is told to refresh.
- **Row locks** (`SELECT … FOR UPDATE`) where a total is checked and then
  changed: payments, refunds, stock.

Payments, refunds and goods receipts also carry an idempotency key, so a
form sent twice records once.

## Scheduled work, email and realtime

- Scheduled routes are under `apps/portal/app/api/cron/`. Each needs the
  `CRON_SECRET` header. Vercel runs the daily ones
  (`apps/portal/vercel.json`); the database's `pg_cron` calls the frequent
  ones (`scripts/v25-supabase-scheduler.sql`,
  `scripts/v36-support-scheduler.sql`). Every run is recorded and shown on
  Settings.
- Email goes through one adapter per app (`lib/email.ts`) over SMTP.
- A realtime ping carries no data, only "something changed". Each browser
  then re-reads through the same permission checks. Without the realtime
  settings the browser polls `GET /api/live/pulse`.

## Modules, the menu and the roadmap

`apps/portal/lib/modules.ts` lists the live modules.
`lib/authz/navigation.ts` builds each person's menu from it and the
permission catalogue, so nobody sees a door they cannot open. Modules that
are not built are not in the main menu: each has a page under `/roadmap`,
generated from `lib/roadmap.ts`, and its old address redirects there
(`next.config.ts`).

Colours come from CSS variables (`--ejo-primary`, `--ejo-surface` and so
on) in each app's `globals.css`, with light and dark values. The
organisation's name and logo come from the database inside the portal.

## Adding a module

The order that keeps the security and audit rules intact:

1. **Schema.** Add the models to `packages/database/prisma/schema.prisma`
   with an `organisationId` or `branchId` (or a parent link). Additive
   only. If the push needs SQL first (a backfill, a unique index), add a
   numbered file to `scripts/predeploy/`.
2. **Data inventory.** Declare each table in
   `apps/portal/lib/governance/data-inventory.ts`.
   `tests/data-inventory.test.ts` fails until this is done.
3. **Permissions.** Add the keys to `PERMISSIONS` in
   `apps/portal/lib/authz/catalogue.ts` and grant them to roles with a
   scope. Add allowed and denied cases to `tests/authz.test.ts`.
4. **Rules.** Put the pure rules (statuses, checks, verdicts) in
   `lib/<module>/` with no database access, so they can be unit-tested.
   `lib/plant/line.ts` is an example.
5. **Server actions.** One file in `apps/portal/lib/actions/`. Each
   exported action: `requireUser()`, `authorize(...)`, fenced reads,
   compare-and-set for status changes, `writeAuditLog` for each change,
   plain error messages.
6. **Pages.** `apps/portal/app/(app)/<module>/`, each guarded with
   `guardPage` / `guardAnyPage`. Reuse `components/ui` (`PageHeader`,
   `SectionCard`, `EmptyState`, `StatusChip`). Check phone width and dark
   mode.
7. **Menu.** Add the module to `lib/modules.ts` as `LIVE` and its menu
   rule to `lib/authz/navigation.ts`. Remove its entry from
   `lib/roadmap.ts` if it had one.
8. **Notifications and email** through the existing rules
   (`lib/notification-rules.ts`) and templates (`lib/email-templates/`).
9. **Tests.** Unit tests for the pure rules; a Playwright spec in a new
   file under `apps/portal/e2e/` covering the normal path, a refused role
   and a person from another organisation. Seed additions must be safe to
   run twice.
10. **Docs.** Update the module table in the top-level `README.md` and,
    if a rule changed, `ARCHITECTURE_BASELINE.md`.

## Changing the database

- Schema changes are additive. `prisma db push` runs without
  `--accept-data-loss`, so a change that would drop a column or table
  stops the deploy.
- A production deploy runs, in order: `scripts/predeploy/*.sql`, the
  schema push, `scripts/postdeploy/*.sql`. The SQL files are numbered and
  safe to run twice.
- Row-level security is on for every table with no policies, and the
  hosting provider's public roles have no grants
  (`scripts/postdeploy/0001-rls-default-deny.sql`). The applications
  connect as the owner role through Prisma.
- Anything that reshapes existing data is a reviewed SQL script with a
  backup first.

## Coding rules

- **TypeScript strict.** No `any` without a comment saying why.
- **Every server action authorises first.** `requireUser()` and then
  `authorize(...)` (or a guard listed in `tests/guard-coverage.test.ts`).
  Reads by id check the record (`tests/tenant-coverage.test.ts`). CI fails
  otherwise.
- **Fence every query.** Lists use `reachWhere` / `orgWhere`. Creates
  stamp the organisation and branch from the server.
- **Audit every change** with `writeAuditLog`: a plain-language action,
  the record, and `changes: { field: { from, to } }` for edits. Never
  passwords or tokens.
- **Workflow changes are compare-and-set.** Money and stock totals are
  checked under a row lock.
- **Declare every new table** in the data inventory.
- **Schema changes are additive.** Never `--accept-data-loss`.
- **No hard-coded organisation data.** Names, addresses, phone numbers,
  bank details, URLs and email senders come from the database or
  environment variables, with neutral fallbacks.
- **Colours from tokens.** Use `var(--ejo-*)`. Tailwind needs literal
  class strings, so never build a class name from a variable.
- **Plain English on screen.** Clear success and error messages; no stack
  traces or library messages. Use `pluralize` and the Africa/Lagos date
  helpers in `lib/utils`. British spelling ("organisation").
- **Comments say why**, in a sentence or two. History belongs in git.
- **Keep accessible names stable.** Playwright selects buttons, links and
  headings by role and name, so renaming a button can break a test.
