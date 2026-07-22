# EJO 100 — Enterprise Operating System (EnterpriseOS)

A reusable, configurable enterprise platform. First implementation:
**Kewalram Chanrai Group Nigeria**, Workshop module (Automotive Division,
Isolo Branch, Lagos State).

This is **Phase 1: Foundation** — monorepo, routing skeletons for the public
website and the enterprise portal, the NestJS module skeleton, the core
database schema (org hierarchy, identity/access, module registry, dynamic
branding), and the shared design system primitives. No business logic yet —
see `docs/architecture.md` and `docs/module-creation-guide.md` for how later
phases build on this without reshaping the core.

## Apps

| App              | Purpose                                   | Port |
|-------------------|--------------------------------------------|------|
| `apps/website`    | Public corporate website (client-branded)  | 3000 |
| `apps/portal`     | EJO 100 Enterprise Platform (employee login)| 3001 |
| `apps/api`        | NestJS backend                             | 4000 |

## Getting started

```bash
npm install
cp .env.example .env   # fill in real values

npm run dev:website    # http://localhost:3000
npm run dev:portal     # http://localhost:3001
npm run dev:api        # http://localhost:4000/api/v1
```

Database (once Postgres is available):

```bash
npm run generate --workspace=packages/database
npm run migrate:dev --workspace=packages/database
```

## Documentation

- [`docs/architecture.md`](./docs/architecture.md) — system overview, the
  "every route exists" rule, module registry, dynamic branding engine.
- [`docs/folder-structure.md`](./docs/folder-structure.md)
- [`docs/coding-standards.md`](./docs/coding-standards.md)
- [`docs/module-creation-guide.md`](./docs/module-creation-guide.md) — how
  to activate the next module (Inventory, HR, Finance, ...).

## Roadmap

Phase 1 Foundation (this delivery) → Phase 2 Identity & Access → Phase 3
Company Hierarchy → Phase 4 Forms Engine → Phase 5 Workflow Engine →
Phase 6 Document & Case Management → Phase 7 Workshop Module (full business
logic) → Phase 8 Inventory & Store Management → Phase 9 Reports &
Dashboards → Phase 10 Testing, Optimization, Deployment → future phases
(HR, Finance, Manufacturing, Agriculture, Healthcare, CRM, Sales, Payroll,
Visitor Management, Fleet, E-commerce, Mobile, AI Assistant).
