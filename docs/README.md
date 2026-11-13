# Documentation index

Every document in this folder, grouped by what it is for. All are plain
Markdown and can be edited in any text editor or on GitHub.

Two kinds of document live here:

- **Current reference**: describes the system as it is and is kept up to
  date.
- **Historical record**: a report written at a point in time (a release,
  a test programme, an assessment). It is kept as evidence and is not
  updated. Counts, versions and "planned" items in a record are as of its
  date. Each one is marked *Record* below with that date.

If a record and a current reference disagree, the current reference and
the code are right.

## Start here

| Document | What it is |
|---|---|
| [../README.md](../README.md) | What EJO 100 is, the module map, how to run and deploy it, and answers to the questions the client's IT team raised. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the system is built: the three applications, how a request flows, the organisation and branch fences, how to add a module, coding rules. |
| [ASSEMBLY_LINE_GUIDE.md](ASSEMBLY_LINE_GUIDE.md) | Using EJO 100 at the assembly plant, step by step: kits, the line, defects, QA audit, PDI, the yard, labels, and what goes to SAP. Written for plant managers and supervisors. |
| [DEMO_WALKTHROUGH.md](DEMO_WALKTHROUGH.md) | A script for showing the system live, section by section, with the demo files. Follows the questions the client raised in October 2026. |
| [KEWALRAM_DEMO.md](KEWALRAM_DEMO.md) | The demo organisation: who to sign in as and a 15-minute tour. **Generated file**: do not edit by hand. Change `apps/portal/lib/demo/tour.ts` or `people.ts` and run `npm run demo:tour-doc`; a test fails if the file and the code differ. |

## How it works

| Document | What it is |
|---|---|
| [ARCHITECTURE_BASELINE.md](ARCHITECTURE_BASELINE.md) | The binding architecture and security rules in full: identity, tenancy, roles, scopes, audit, concurrency, deployment. Pull requests are reviewed against it. Its counts (tables, permissions, roles, tests) are as of 12 October 2026. |
| [ROLES_AND_ACCESS.md](ROLES_AND_ACCESS.md) | What each role sees, does and approves, and what it never sees. Includes the plant roles and who may run imports, exports and SAP postings. |
| [SUPPORT_CENTRE.md](SUPPORT_CENTRE.md) | The support centre: how a request flows, teams and addresses, the rules that keep it safe, the figures, how to run it. |
| [ENYO_CONTEXT_AND_INTEGRITY.md](ENYO_CONTEXT_AND_INTEGRITY.md) | How Enyo (the built-in assistant) recognises who is writing, how its replies are checked, the integrity watch and the Speak up channel, and the decision model. |
| [ENYO_BRIEF_AND_LEARNING.md](ENYO_BRIEF_AND_LEARNING.md) | Enyo's daily brief, how it adapts to each role, and what it learns from. |
| [ML.md](ML.md) | The Python training package in `ml/`: the six prediction tasks, data quality rules, how to switch training on, how to change a model. |
| [AI_READINESS.md](AI_READINESS.md) | The rules for what Enyo may read and do: data classification, the tenant fence for retrieval, the service boundary, audit, privacy. Written as an assessment on 12 October 2026 and extended since; its opening status line predates Enyo being built. |

## Operations

| Document | What it is |
|---|---|
| [OPERATIONS_CHECKLIST.md](OPERATIONS_CHECKLIST.md) | What the owner sets in the hosting dashboards: environment variables per application, plans, firewall, spend limits, backups, custom domains, steps after each release. |
| [RUNBOOKS.md](RUNBOOKS.md) | Procedures: repository hardening, proving the database's public interface is closed, staging, the backup restore drill, the load test, failure drills, checking scheduled jobs. The boxes are for the operator to tick. |
| [FREE_PLAN.md](FREE_PLAN.md) | The free hosting plans the system runs on while it is demonstrated and piloted, the limits of each, and when to move to paid plans. |
| [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) | What is verified and in place, what was deliberately left out and when to add it, the recovery steps, and the remaining risks. Partly a record (Phase A close-out); the principles in §7 still bind. |

## Integrations and data

| Document | What it is |
|---|---|
| [SAP_INTEGRATION.md](SAP_INTEGRATION.md) | How each EJO record lines up with SAP, field by field; who owns what; the daily postings files for SAP (§3a) and SAP's answers; SAP master data coming back in. |
| [DATA_MIGRATION.md](DATA_MIGRATION.md) | Bringing existing records in from SAP extracts and Excel: the six steps of an import, who approves, every file layout, the cut-over checklist, undo, the measured 800,000-part load, exports. |
| [demo/README.md](demo/README.md) | The demo files used by the walkthrough: one folder that loads cleanly and one with planted mistakes. **Generated** by `apps/portal/scripts/demo-files.ts`; tests read these files. |

## Releases and history

All of these are historical records.

| Document | Date | What it records |
|---|---|---|
| [MASTER_PLAN.md](MASTER_PLAN.md) | to 13 Oct 2026 | *Record.* The phase-by-phase plan for version 1: what was done in which pull request, and requests carried over. |
| [V1_CLOSURE_REPORT.md](V1_CLOSURE_REPORT.md) | 12 Oct 2026 | *Record.* Version 1 closure: what was tested, the findings register, the load baseline, the definitions behind the analytics figures. |
| [V1_FINAL_RELEASE_REPORT.md](V1_FINAL_RELEASE_REPORT.md) | 13 Oct 2026 | *Record.* The final version 1 release: fixes, test and deployment evidence, open risks, actions left to the owner. |
| [CUSTOMER_PORTAL_CRM_RELEASE.md](CUSTOMER_PORTAL_CRM_RELEASE.md) | 12 Oct 2026 | *Record.* The customer portal and CRM release, its test programme and documented limitations. |
| [TESTING_PROGRAMME.md](TESTING_PROGRAMME.md) | 12 Oct 2026 | *Record.* The security, concurrency and load test programme: findings, how each was closed, how to run it again. The tests themselves still run in CI. |
| [E2E_COVERAGE.md](E2E_COVERAGE.md) | 12 Oct 2026 | *Record.* The browser test suite as it stood then: specs, the workflow-by-role matrix, defects found. The suite has grown since; the specs in `apps/portal/e2e/` are the current list. |
| [ENTERPRISE_READINESS.md](ENTERPRISE_READINESS.md) | 17 Oct 2026 | *Record.* A gap analysis against enterprise requirements: what stage 1 delivered, the threat model, what must not be claimed yet (§9), and the staged plan with owners. §9 is still the honest list of gaps. |
| [ENYO_RELEASE.md](ENYO_RELEASE.md) | Enyo 1.0 | *Record.* Release notes for the assistant: where it appears, its safety rules, how to switch it on, known limits. |

## Editing these documents

- Keep them plain Markdown. No generated HTML, no images that need a tool
  to rebuild.
- Do not edit `KEWALRAM_DEMO.md` or anything under `demo/` by hand: both
  are written by scripts and checked by tests.
- When a rule in the code changes, change the current reference in the
  same pull request. Leave the records as they are.
- Changes under `docs/` and to `*.md` files do not trigger the CI
  workflows.
