# Building a Zinox module — rules for every builder

Repository: `/home/user/zinox-ejo100` (a git worktree on branch `zinox-edition`; `node_modules` are symlinks to a
sibling checkout — never run `npm install`). Portal app: `apps/portal`. Database package: `packages/database`
(Prisma client already generated; local Postgres `zinox` already pushed — see `.env`).

Read first, in this order: `docs/ZINOX_DOMAIN.md` (what the business does and the status flows), the
"ZINOX EDITION" section at the end of `packages/database/prisma/schema.prisma` (your models, exactly as they
exist), `docs/ZINOX_BUILD_CONVENTIONS.md` (how pages, actions, guards, tests and printing are done here),
`apps/portal/lib/authz/catalogue.ts` (the permission keys and which roles hold them — use only keys that exist),
`apps/portal/lib/zinox/numbering.ts` and `apps/portal/lib/zinox/people.ts`.

## Ownership
You own only the files listed in your assignment (new directories under `app/(app)/<module>/`, `app/print/<doc>/`,
`lib/actions/<module>*.ts`, `lib/<module>-core.ts`, `components/<module>/`, `lib/enyo/tools/<module>.ts`,
`lib/email-templates/<module>-*.ts`, `tests/<module>*.test.ts`, `e2e/<module>.spec.ts`). Do NOT edit shared files:
`schema.prisma`, `lib/authz/*`, `lib/modules.ts`, `lib/roadmap.ts`, `lib/approvals.ts`, `lib/actions/dashboard.ts`,
`lib/actions/search.ts`, `lib/search-plan.ts`, `lib/notification-rules.ts`, `lib/record-resolver.ts`,
`lib/governance/*`, `lib/enyo/tools/index.ts`, `lib/enyo/tool-select.ts`, `lib/enyo/guide.ts`, `lib/errors.ts`,
`components/ui/*`, `components/Sidebar.tsx`, `next.config.ts`, `e2e/people.ts`, `e2e/seed.ts`, `e2e/role-matrix.spec.ts`,
`tests/email-fixtures.ts`, `packages/database/prisma/seed.ts`. If you need a line added to one of those, put the
exact text under "Shared changes requested" in your final report; the integrator applies it. Never run `git commit`,
`git checkout`, `git stash` or `git reset`.

## How to build (the conventions, condensed)
* Every route folder: `layout.tsx` = `guardAnyPage([...keys], '/<module>')` only; `loading.tsx` =
  `export { default } from '@/components/RouteLoading';`. Module home = `PageHeader hero live eyebrow="Module · X"` +
  KPI `StatTile`s + `NavCard`s filtered with `allows()`.
* Business actions in `lib/actions/<module>.ts` (`'use server'` first line): guard first with `authorize(key, { branchId, homeBranch: true })`
  or `authorize(key)` for organisation-owned records; fence reads with `reachWhere('<view key>')` (branch-owned) or
  `orgWhere()` / `orgOwned()` (organisation-owned); reads by id go through `seeOrNull` / `reachWhere` / `orgWhere` /
  `canSeeRecord`; write `writeAuditLog({ userId, action: '<entity_snake>.<verb_past>', entityType: '<PrismaModel>',
  entityId, metadata: { referenceNumber: record.number, ... } })` after every change; status transitions are
  compare-and-set: `stillAsSeen(await prisma.x.updateMany({ where: { id, status: current }, data: { status: next, ... } }))`
  (never `update` with `status` in data); functions named `approve*|decide*|decline*|reject*|release*|verify*|disburse*`
  start with `await refuseDuringAssist('<name>')` and refuse self-approval (the requester cannot approve their own record).
  Numbers come from `nextDocumentNumber('<PREFIX>', organisationId)`; serials from `nextSerialNumber`.
* Form handlers in `lib/actions/<module>-form-handlers.ts` (`'use server'`): FormData → action → `revalidatePath` →
  `redirect('<page>?status=<code>')`, or `redirect('<page>?error=<friendlyError(...)>')` — `redirect` outside `try`.
  Pages read `searchParams: Promise<{ status?: string; error?: string }>` and show `FormFeedbackBanner`.
* UI only with the kit in `components/ui` (`PageHeader, HeaderAction, BackLink, PageTitle, SectionCard, EmptyState, NavCard,
  StatTile, StatusChip, ResponsiveTable, RevealPanel, SubNav`) plus `SubmitButton`, `FormPendingOverlay`, `FilterSelect`,
  `SearchableSelect`, `LiveSearchInput`, `AuditTrail`, `PrintMenu`, `IdempotencyKey`, `RefineTextButton`. Colours only via CSS
  variables (`var(--ejo-primary)`), never hex (print pages: `accentColor="#E10600"`). Plain English copy; the people
  are at Zinox Technologies: say "unit", "serial", "dealer", "pro-forma invoice", never "job card" or "vehicle".
* Money: `formatCurrency(amount, 'NGN')` from `@ejo/utils`; dates: `lib/utils/format-date`.
* Tests that scan source will fail CI unless you follow the above: `guard-coverage`, `tenant-coverage`,
  `integrity-coverage`, `authz`, `search`, `enyo`, `emails` (every `render*Email` needs a fixture — the integrator adds
  fixtures: list yours). Pure rules (state machines, totals, discount limits, checklists) go in `lib/<module>-core.ts`
  with RELATIVE imports only and a `tests/<module>.test.ts`.
* Enyo: `lib/enyo/tools/<module>.ts` exporting `<module>Tools: StaffTool[]` (read-only lookups guarded with `allows(...)`,
  fenced with `orgWhere()`/`reachWhere()`); the integrator wires the registry and guide.
* Print pages under `app/print/<doc>/[id]/page.tsx` with `DocumentHeader` / `DocumentFooter` / `SignatureBlock`,
  `?variant=client` for the customer copy.
* Verify before you report: `cd apps/portal && npx tsc --noEmit` must be clean, then
  `npx tsc -p tsconfig.test.json --outDir .test-out-<module>` and
  `node --test .test-out-<module>/tests/<module>*.test.js .test-out-<module>/tests/guard-coverage.test.js
   .test-out-<module>/tests/tenant-coverage.test.js .test-out-<module>/tests/integrity-coverage.test.js
   .test-out-<module>/tests/authz.test.js .test-out-<module>/tests/search.test.js .test-out-<module>/tests/data-inventory.test.js`
  — all green (the tests read `ROOT = join(__dirname, '..', '..')`, so the outDir must sit directly in `apps/portal`).
  Never run `npm test` (the shared `.test-out` collides with other builders). Delete your `.test-out-<module>` at the end.
* Report: what you built (routes, actions, prints, tools), the status codes your forms emit, shared changes
  requested (exact lines), email templates added (for fixtures), and anything unfinished.
