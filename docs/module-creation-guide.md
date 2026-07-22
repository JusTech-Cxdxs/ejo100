# Adding a New Module

Example: activating **Inventory** in a later phase.

1. **Database** — add the real tables to
   `packages/database/prisma/schema.prisma` (Phase 1 already has the
   `Inventory`-adjacent hierarchy it will hang off of: Branch, Department).
   Run a migration.
2. **API** — fill in `apps/api/src/modules/inventory/inventory.service.ts`
   with real Prisma queries via `@ejo/database`; add endpoints to
   `inventory.controller.ts`. The module is already registered in
   `app.module.ts` — nothing to change there.
3. **Portal UI** — replace the `<PagePlaceholder />` in
   `apps/portal/app/(app)/inventory/page.tsx` with the real screen(s). Add
   nested routes under `inventory/` the same way `workshop/customers`,
   `workshop/vehicles`, etc. were added.
4. **Flip the status** — change `inventory`'s status from `COMING_SOON` to
   `LIVE` in `apps/portal/lib/modules.ts` (and the `PlatformModule` row once
   the API is wired up). The sidebar badge updates automatically; no
   routing or layout code changes.
5. **Document templates** (if the module introduces forms) — add them to
   the Template Library per the platform's Template Library model (only
   the platform owner authors templates; company admins assign them).

This is the pattern every future module (HR, Finance, Manufacturing, etc.)
follows — the core platform doesn't change, only configuration and the
module's own files.
