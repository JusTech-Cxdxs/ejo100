# Adding a module

The order that keeps the security and audit rules intact. Example: a new
"Targets" module (see `/roadmap/targets` for its design).

1. **Schema.** Add the models to `packages/database/prisma/schema.prisma` with an
   `organisationId` or `branchId` (or a parent link). Additive only.
2. **Data inventory.** Declare each table in
   `apps/portal/lib/governance/data-inventory.ts`. `tests/data-inventory.test.ts`
   fails until you do.
3. **Permissions.** Add the permission keys to `PERMISSIONS` in
   `apps/portal/lib/authz/catalogue.ts` and grant them to roles with a scope.
   Add allowed **and** denied cases to `tests/authz.test.ts`.
4. **Server actions.** One file in `apps/portal/lib/actions/`. Each exported
   action: `requireUser()`, `authorize(...)`, fenced reads, compare-and-set for
   status changes, `writeAuditLog` for each change, friendly errors.
5. **Pages.** `apps/portal/app/(app)/<module>/`, with a `layout.tsx` that calls
   `guardPage` / `guardAnyPage`. Reuse `components/ui` (`PageHeader`,
   `StatTile`, `SectionCard`, `EmptyState`). Check phone width and dark mode.
6. **Menu.** Add the module to `lib/modules.ts` as `LIVE` and its menu rule to
   `lib/authz/navigation.ts`. Remove its entry from `lib/roadmap.ts` (and its
   redirect in `next.config.ts`, if it had one).
7. **Notifications and email** through the existing rules
   (`lib/notification-rules.ts`) and templates (`lib/email-templates/`).
8. **Tests.** Unit tests for pure rules; a Playwright spec in a new file under
   `apps/portal/e2e/` covering the happy path, a refused role and a person from
   another organisation. Seed additions must be idempotent.
9. **Docs.** Update `README.md` (modules table) and, if a rule changed,
   `docs/ARCHITECTURE_BASELINE.md`.
