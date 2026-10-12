# EJO 100 — Architecture overview

A short orientation for engineers. The binding rules are in
[ARCHITECTURE_BASELINE.md](ARCHITECTURE_BASELINE.md); this page explains how the
pieces fit so the rules make sense.

## Three apps, one database

| App | Who uses it | What it is |
|---|---|---|
| `apps/portal` | Staff | The ERP. Next.js 15 App Router. Pages are server components; every write is a server action in `lib/actions/*` that authorises and then calls Prisma directly. |
| `apps/website` | The public and customers | The organisation's own website (its brand, not EJO's) and the customer portal under `/customer-portal`, with a separate customer sign-in. |
| `apps/api` | The platform team | NestJS. Health check and read-only platform routes. No business workflow depends on it. |

All three use `@ejo/database` (`packages/database`): the Prisma schema, the
shared client and the audit journal that records every write.

The portal does not call the API for business work. That was the Phase 1 plan;
in practice server actions gave one place to authorise, validate, write and
audit, and the API stayed thin.

## Organisation model

```
Platform team ─ Organisation ─ Business unit ─ Branch ─ Department ─ Team ─ People
                            └─ customers, vehicles, warranty providers and policies (organisation-wide)
```

Countries, states and cities are reference data that branches point to. Nothing
in code assumes a particular organisation: Kewalram Nigeria, its Automobile
Division and the Isolo branch are rows created by the seed. Each record is
fenced to its organisation (and usually its branch); see the baseline §2 and §7.

## A request, end to end

1. `middleware.ts` checks for a sign-in cookie, applies the submission flood
   limit and lets public paths through.
2. The page or server action calls `requireUser()` (session from the database,
   switched-off accounts refused) and then `authorize(permission, record)` from
   `lib/authz/server.ts`.
3. Workflow changes use compare-and-set (`lib/integrity.ts`): the status the
   person saw is part of the `where`, so a second click or a second person
   changes nothing.
4. Prisma writes are journalled with before/after values; `writeAuditLog`
   records the business event in plain words.
5. After the response: emails (`lib/email.ts`), a data-free realtime ping.
   Their failure never undoes the action.

## Module registry and the roadmap

`apps/portal/lib/modules.ts` lists the live modules; `lib/authz/navigation.ts`
builds each person's menu from it and the permission catalogue, so nobody sees
a door they cannot open. Modules that are not built are not in the menu; they
have a page under `/roadmap`, generated from `lib/roadmap.ts`, and their old
addresses (`/hr`, `/payroll`, …) redirect there (`next.config.ts`).

## Branding and theme

Colours come from CSS variables (`--ejo-primary`, `--ejo-surface`, …) defined in
each app's `globals.css`, with light and dark values. Components use the
variables, never raw colours. The organisation's name and logo come from the
database (`Organisation`, `Branding`) inside the portal; the website reads the
organisation set by `NEXT_PUBLIC_ACTIVE_ORGANISATION_SLUG`.
