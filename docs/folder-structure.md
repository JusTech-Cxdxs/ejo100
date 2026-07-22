# Folder Structure

```
ejo100/
├── apps/
│   ├── website/        # Public corporate website (Next.js) — client-branded
│   ├── portal/          # EJO 100 Enterprise Platform (Next.js) — employee login
│   └── api/              # NestJS backend
├── packages/
│   ├── ui/               # Shared design-system components
│   ├── database/         # Prisma schema, migrations, shared client
│   ├── types/             # Shared TypeScript types
│   ├── config/            # Shared design tokens / lint / tailwind presets
│   └── utils/              # Framework-agnostic helpers (slugify, doc numbering, etc.)
├── docs/                   # This documentation
└── .github/workflows/      # CI
```

Each app in `apps/*` is deployable independently. Everything two or more
apps need lives in `packages/*` and is imported via the `@ejo/*` workspace
alias (see root `tsconfig.base.json`) — never copy-pasted between apps.
