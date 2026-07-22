# EJO 100 — Architecture Overview

## Two systems, one platform

1. **apps/website** — the public corporate website. 100% client-branded
   (Kewalram Nigeria for Phase One). No EJO branding is ever visible here.
2. **apps/portal** — the EJO 100 Enterprise Platform. Employees log in here.
   Carries a subtle "Powered by EJO 100 Enterprise Platform" credit only.

Both are separate Next.js apps so they can be deployed, scaled, and cached
independently, but they share the same design tokens (`packages/config`,
mirrored CSS variables in each app's `globals.css`) and the same component
library (`packages/ui`) so they read as one ecosystem.

`apps/api` is a NestJS service both apps eventually call for anything that
needs the database — Phase 1 wires up the module structure only.

## The "every route exists" rule

Every page and every portal module listed in the project constitution exists
in routing from Phase 1, even where it has no business logic yet. Instead of
a 404 or a blank page, unbuilt routes render `<ComingSoon />` from
`@ejo/ui`. This means:

- The client sees the full shape of the product on day one.
- Activating a module later is a status flip (`ModuleStatus` in
  `packages/database/prisma/schema.prisma`, mirrored in
  `apps/portal/lib/modules.ts`), not new page-building.

## Module registry

`apps/portal/lib/modules.ts` is the single source of truth the sidebar reads
to decide what to show and how to badge it (Live / Coming Soon / Disabled).
Once the API's `PlatformModule` / `CompanyModule` tables are wired up, this
file becomes a client-side cache of that data rather than a hardcoded list.

## Dynamic branding engine

No component should ever import a hardcoded hex colour. Colours flow:

```
Branding (Postgres, packages/database) --> BrandingTokens (packages/types)
  --> CSS variables (--ejo-primary, etc. in each app's globals.css)
  --> Tailwind utility classes reference the variables, e.g. bg-[var(--ejo-primary)]
```

`apps/website/lib/branding.ts` is a Phase 1 stub returning Kewalram's green
theme; swapping it for a real API call is the only change needed to re-theme
the whole site for a different client.

## Organization hierarchy

```
Platform -> Company -> Business Unit -> Country -> State -> City -> Branch
  -> Department -> Team -> Users
```

Modeled in `packages/database/prisma/schema.prisma`. Nothing above is
hardcoded — Kewalram Nigeria / Automobile Division / Nigeria / Lagos State /
Isolo / Isolo Branch / Workshop is simply the first row set seeded into it.

## Phase 1 scope

Foundation only: monorepo, routing skeletons for both apps, the NestJS
module skeleton (no business logic), the core Prisma schema (hierarchy +
identity/access + module registry + branding — no Workshop/Inventory/HR
business tables yet), the shared design system primitives, and this
documentation. See `docs/module-creation-guide.md` for how later phases
extend this without reshaping the core.
