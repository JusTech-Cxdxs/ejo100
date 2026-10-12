# Folder structure

```
ejo100/
├── apps/
│   ├── portal/                     staff ERP (Next.js 15)
│   │   ├── app/(app)/<module>/     signed-in pages; a module's layout.tsx guards it (guardPage / guardAnyPage)
│   │   ├── app/(auth)/             sign-in, forgot / reset password
│   │   ├── app/print/              printable documents (same record checks as the pages)
│   │   ├── app/api/                auth, health, live pulse, cron routes
│   │   ├── lib/actions/            server actions ('use server'); *-form-handlers.ts adapt forms to them
│   │   ├── lib/authz/              permission catalogue, enforcement, navigation
│   │   ├── lib/governance/         data inventory
│   │   ├── lib/email-templates/    one file per email
│   │   ├── lib/*.ts                pure rules and helpers (analytics, reminders, integrity, calendars)
│   │   ├── components/             shared UI (components/ui for page building blocks)
│   │   ├── tests/                  unit and source-coverage tests (node --test)
│   │   └── e2e/                    Playwright specs, seed, security sweeps
│   ├── website/                    public website + customer portal (Next.js 15)
│   └── api/                        NestJS API
├── packages/
│   ├── database/                   Prisma schema, client, audit journal, seed
│   ├── ui/                         ComingSoon, ModuleStatusBadge
│   ├── types/                      shared TypeScript types
│   ├── utils/                      framework-free helpers
│   └── config/                     design tokens for Tailwind
├── scripts/                        deploy scripts; predeploy/ and postdeploy/ SQL; vNN-*.sql one-off scripts
├── ops/load-test/                  k6 scripts
├── docs/
└── .github/workflows/              ci.yml, e2e.yml, security.yml
```

Code that two apps need goes in `packages/*` and is imported as `@ejo/*`.
Where the two apps need the same small helper with different runtime
dependencies (email, auth), each app keeps its own copy and the copies say so
in a comment.
