# EJO 100

EJO 100 is a web system for running the day-to-day operations of an automotive business: the
workshop, the parts store, warranty, the security gate and the assembly plant, with a portal
where customers follow their own vehicles. It records who did what, at which branch, and who
approved it. It is built to sit beside SAP: SAP stays the system of record for finance,
procurement and the material master, and EJO exchanges files with it.

**Who it is for.** The first organisation is Kewalram Chanrai Group's automotive business in
Nigeria: a workshop branch, a warehouse and an assembly plant. Staff use the portal on desktops
and tablets. Customers use the customer portal. This file is for the IT team that will review,
host and maintain it.

Everything described here is in this repository. What is demo data only, and what is not built,
is said where it applies.

## Module map

Staff portal (`apps/portal`). Pages are in `app/(app)/<folder>`, the rules in `lib/`, the server
actions in `lib/actions/`.

| Module | What it does | Who uses it | Where |
|---|---|---|---|
| Workshop | Job cards from check-in to check-out, vehicle services, estimates with two approvals, parts requests, outside purchases, payments and refunds | Front desk, technicians, supervisors, workshop manager, finance | `app/(app)/workshop`, `lib/actions/workshop.ts` |
| Customers | Customer records, their vehicles, jobs, payments and warranties on one page; portal access | Front desk, customer care | `app/(app)/crm` |
| Inventory | Parts, stock by batch with FIFO cost, goods receipts, suppliers, pricing, reorder levels | Store manager, store officers | `app/(app)/inventory` |
| Warranty | Providers, policies, vehicle and part warranties, claims with two approvals | Warranty officers and head | `app/(app)/warranty` |
| Assembly plant | Kit shipments and kit QC, the line station by station, defects and rework, the quality gate, QA audits, pre-delivery inspection, vehicle labels | Plant manager, supervisors, inspectors, operators | `app/(app)/plant`, `lib/plant`, `lib/actions/plant*.ts` |
| Security | Visitors, contractors, deliveries, vehicles in and out, exit passes, road-test permits, incidents | Security desk; every employee for their own pass | `app/(app)/security` |
| Data Exchange | Imports from SAP extracts and Excel, exports of any list, the cut-over checklist, the daily postings files for SAP | IT, administrators, department heads who approve | `app/(app)/data-exchange`, `lib/data-exchange`, `lib/sap` |
| Headquarters, Business Analytics | Figures per branch and period; each figure links to the records behind it | Executives, managers | `app/(app)/headquarters`, `app/(app)/analytics` |
| Scheduling | Calendars, appointments, meeting rooms | Everyone | `app/(app)/schedule` |
| Support centre | Customer and staff requests from email, chat and calls, in teams with targets | Customer care, support teams | `app/(app)/crm/support`, `lib/support` |
| Enyo | The built-in assistant: answers from the records the person may see and drafts for a person to send. It never approves or submits anything. Needs a language-model server to be configured | Everyone | `app/(app)/enyo`, `packages/enyo`, `ml/` |
| Integrity watch | Daily checks for risky patterns (same person asking and approving, refunds above payments) and an anonymous reporting channel | Reviewers | `app/(app)/integrity` |
| Administration | Organisation, branches, departments, users, roles, permissions, settings, audit logs, recycle bin | Administrators | `app/(app)/users`, `roles`, `branches`, `structure`, `audit-logs`, `recycle-bin`, `settings` |
| Print views | Estimates, receipts, gate passes, vehicle labels, PDI certificates | Whoever may print each | `app/print` |

Website (`apps/website`): the organisation's public site and, under `/customer-portal`, the
customer portal (vehicles, services, estimates, payments, warranties, support).

API (`apps/api`): a health check and read-only routes for the platform team. No business
workflow uses it. Most of its module folders are empty placeholders.

Modules that are planned and not built (HR, payroll, finance and accounting, procurement,
vehicle sales and others) are listed in the portal under `/roadmap`, from
`apps/portal/lib/roadmap.ts`.

## Repository layout

```
apps/portal      staff portal (Next.js): pages, server actions, tests, browser tests
apps/website     public website and customer portal (Next.js)
apps/api         NestJS API (platform team only)
packages/database  Prisma schema, shared client, audit journal, seed
packages/enyo    the assistant's shared core
packages/ui, types, utils, config   shared components, types, helpers, design tokens
ml/              Python package that trains Enyo's prediction models
scripts/         deploy scripts and reviewed SQL (predeploy/, postdeploy/)
ops/load-test/   k6 load-test scripts
docs/            documentation (index: docs/README.md)
.github/workflows/  ci.yml, e2e.yml, security.yml, ml-train.yml
```

Detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Technology

Versions as declared in the `package.json` files and `ml/requirements.txt`.

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 24.x |
| Language | TypeScript (strict) | 5.9.3 |
| Portal, website | Next.js (App Router, server actions) | 15.5.28 |
| UI | React, Tailwind CSS | 19, 4 |
| Sign-in | Better Auth (sessions in the database, HTTP-only cookies) | 1.6 |
| Database access | Prisma | 5.22.0 |
| Database | PostgreSQL | 16 |
| API | NestJS | 11 |
| Email | Nodemailer over SMTP | 10 |
| Browser tests | Playwright | 1.64 |
| Model training | Python with scikit-learn 1.7.2 and LightGBM 4.6.0 | 3.11 or later |

There is no proprietary runtime and no build step that needs a private service. Exact resolved
versions are in `package-lock.json`.

## Running it locally

Needs Node.js 24, npm and a PostgreSQL 16 database of your own.

```bash
npm install                       # also generates the Prisma client
cp .env.example .env              # fill in your own values; never commit .env

# Create the tables in YOUR development database (never production)
npx prisma db push --schema=packages/database/prisma/schema.prisma

# First organisation, roles and the platform administrator
npm run seed --workspace=packages/database

npm run dev:portal                # http://localhost:3001
npm run dev:website               # http://localhost:3000  (customer portal at /customer-portal)
npm run dev:api                   # http://localhost:4000/api/v1
```

Point the `SMTP_*` settings at a local mail catcher such as Mailpit so no email reaches a real
inbox. `npm run demo:reset` loads the invented demo records (people, workshop, plant) into a
development database.

Checks before a pull request:

```bash
npm run lint && npm run typecheck
npm run test --workspace=apps/portal
```

**Environment variables** (names only; values live in `.env` locally and in the hosting
dashboards):

- Required: `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `NEXT_PUBLIC_PORTAL_URL`, `NEXT_PUBLIC_WEBSITE_URL`, `PLATFORM_OWNER_EMAIL`.
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`.
- Scheduled jobs: `CRON_SECRET`.
- Seed only: `MASTER_ADMIN_NAME`, `MASTER_ADMIN_EMAIL`, `MASTER_ADMIN_PASSWORD`.
- Optional: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (realtime pings),
  `MAILBOX_ENCRYPTION_KEY` (staff mailboxes and support addresses), `ENYO_LLM_BASE_URL`,
  `ENYO_LLM_API_KEY`, `ENYO_LLM_MODEL` (Enyo), `RECYCLE_BIN_DAYS`, `DATABASE_SPACE_LIMIT_MB`.

The full list, per application, with what each one does, is in
[docs/OPERATIONS_CHECKLIST.md](docs/OPERATIONS_CHECKLIST.md) §1.

## Deployment

Today the portal and the website run on Vercel, the API on Render and the database on Supabase
(PostgreSQL), on free plans while the system is demonstrated and piloted
([docs/FREE_PLAN.md](docs/FREE_PLAN.md)). The host-specific parts are small (the deploy scripts,
the scheduled-job configuration, the optional realtime ping), but it has not been run elsewhere.

```
pull request → CI (build, tests, browser tests, security) → preview (never touches the database)
            → merge to main → production build:
                 1. scripts/predeploy/*.sql   additive SQL, safe to run twice
                 2. prisma db push            without --accept-data-loss: a destructive change stops the deploy
                 3. scripts/postdeploy/*.sql  row-level security on every table, role and data fixes
```

Rollback of code is the host's previous deployment. Because database changes are additive, the
previous code runs against the newer schema. Backups, the restore drill and recovery targets:
[docs/RUNBOOKS.md](docs/RUNBOOKS.md). A restore drill with measured recovery times has not been
done yet.

## How data is protected

- **Roles and permissions.** One file, `apps/portal/lib/authz/catalogue.ts`, lists everything
  that can be done and which role may do it. Every page and every server action checks it on the
  server. A test fails the build if an action has no check.
- **Organisation and branch fences.** A record outside the person's organisation is refused
  before anything else is considered. A person scoped to a branch sees that branch only. The
  plant and the workshop are separate branches.
- **Second-person approval.** Nobody approves their own request, import, inspection or rework.
- **Audit trail.** Every data change is recorded with before and after values, and every
  business step as a named event with the person and time. Audit rows cannot be edited or
  deleted in the database. They are not yet copied to storage outside the database.
- **Recoverable deletes.** Records are cancelled or closed through their workflow, not deleted.
  A record made by mistake, or added by an import that is undone, goes to a recycle bin and can
  be restored for 30 days by default. Payments, refunds and goods receipts are never changed.
- **Additive database changes.** The deploy cannot drop a column or a table. Anything
  destructive is a reviewed SQL script with a backup.
- **Database exposure.** Row-level security is on for every table and the host's public database
  roles have no access.

Not in place: multi-factor authentication, single sign-on and account lockout. The full list of
gaps is in [docs/ENTERPRISE_READINESS.md](docs/ENTERPRISE_READINESS.md) §9.

## How it is tested

| Suite | Where | What it covers |
|---|---|---|
| Unit and source tests | `apps/portal/tests/` (78 files, about 600 tests), run with `npm run test --workspace=apps/portal` | Permission decisions allowed and denied, that every action authorises, that every read is fenced, workflow rules, import checks, analytics against hand-worked answers |
| Other unit tests | `packages/database/tests`, `packages/enyo/tests`, `apps/website/tests`, `ml/tests` | The audit journal, the assistant's guardrails, the website, the training code |
| Browser tests | `apps/portal/e2e/` (71 Playwright spec files) | Each workflow in a real browser against production builds, a real PostgreSQL 16 and a mail catcher, signed in as the role that does each step; attempts from another organisation |
| Security | `.github/workflows/security.yml` | Secret scan of all history, static analysis, dependency audit, OWASP ZAP baseline, access-control sweeps, database-role probes, concurrency bursts |
| Load | `ops/load-test/` | k6 stages against a CI instance |

CI (`ci.yml`) runs lint, type-check, the unit tests and a production build on every push and
pull request to `main`. The browser and security workflows run on every pull request to `main`.
None of them touch production. Pull requests that change only documentation skip them.

## Questions raised by the client's IT team

| Question | Short answer | Detail |
|---|---|---|
| Continuity if the developer is unavailable | The code, schema, tests and documents are in this one repository, on a standard open-source stack. Data is in PostgreSQL and every list exports to Excel or CSV. A second maintainer, source-code escrow and a support agreement are commercial matters and are not answered by the code. | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| SAP integration | By file, both ways. EJO reads SAP extracts with SAP's own field names and writes daily postings files that the SAP team loads with their tools; SAP's return file reconciles each line. There is no live connection (RFC, BAPI, IDoc, OData). It has been run with demo files, not against the client's SAP. | [docs/SAP_INTEGRATION.md](docs/SAP_INTEGRATION.md) |
| Migrating existing data | Built: staff, customers, vehicles, suppliers, parts, opening stock, invoice and job history, open jobs and services, warranties and claims, and the plant's records. Each file is checked, approved by a second person, loaded, and can be undone. Tested with demo files only. | [docs/DATA_MIGRATION.md](docs/DATA_MIGRATION.md) |
| Bulk Excel import, about 800,000 parts | Measured on 31 October 2026: 800,000 materials from upload to searchable catalogue in about 9 minutes on a 2-processor machine. It needs about 1.3 GB of database space, so not the free database plan. | [docs/DATA_MIGRATION.md](docs/DATA_MIGRATION.md) §9 |
| Penetration testing and security | Automated security tests run on every pull request (see above). No penetration test by an independent third party has been done; it is planned and needs a staging environment. | [docs/TESTING_PROGRAMME.md](docs/TESTING_PROGRAMME.md), [docs/ENTERPRISE_READINESS.md](docs/ENTERPRISE_READINESS.md) |
| Liability | Not a matter for the code. It belongs in the contract, with the support terms. The repository's contribution is the audit trail, the approval rules and the list of known gaps. | [docs/ENTERPRISE_READINESS.md](docs/ENTERPRISE_READINESS.md) §9 |
| Use on the assembly line, production and QA | Built: kit QC, the line with stations and measured checks, defects and rework, the quality gate, QA audits, PDI, labels, and two postings files for SAP. Run with demo data only. Not built: yard and dispatch, production planning, parts consumption, links to torque tools or test equipment. | [docs/ASSEMBLY_LINE_GUIDE.md](docs/ASSEMBLY_LINE_GUIDE.md) |

## Where to read next

| Document | For |
|---|---|
| [docs/README.md](docs/README.md) | The index of every document, with which are current and which are historical records |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it is built and how to add to it |
| [docs/ASSEMBLY_LINE_GUIDE.md](docs/ASSEMBLY_LINE_GUIDE.md) | Using it at the plant, step by step |
| [docs/SAP_INTEGRATION.md](docs/SAP_INTEGRATION.md) | Field-by-field mapping to SAP and the daily files |
| [docs/DATA_MIGRATION.md](docs/DATA_MIGRATION.md) | Bringing existing records in, and taking lists out |
| [docs/ROLES_AND_ACCESS.md](docs/ROLES_AND_ACCESS.md) | What each role sees and approves |
| [docs/DEMO_WALKTHROUGH.md](docs/DEMO_WALKTHROUGH.md) | A script for seeing it work, with the demo files |
| [docs/OPERATIONS_CHECKLIST.md](docs/OPERATIONS_CHECKLIST.md), [docs/RUNBOOKS.md](docs/RUNBOOKS.md) | Hosting set-up, backups, drills |
| [docs/ARCHITECTURE_BASELINE.md](docs/ARCHITECTURE_BASELINE.md) | The binding security and architecture rules in full |
| [docs/ENTERPRISE_READINESS.md](docs/ENTERPRISE_READINESS.md) | What is not there yet, and the staged plan |

## Ownership and licence

Proprietary software. The repository is private and its contents grant no licence; use, copying
or deployment needs the written permission of the platform owner. Data stored by a deployment
belongs to the organisation it is about and is handled under the Nigeria Data Protection Act
2023.
