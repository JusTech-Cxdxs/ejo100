# Operations checklist (hosting, firewall, spend, backups)

What the owner sets up in the hosting dashboards. The code cannot do these
things for itself. Each item is marked:

- **[Before release]**: do it before the product is presented or used for real work.
- **[Recommended]**: do it soon after; it reduces risk or cost.

Menu names were checked against each provider's documentation in October 2026.
Providers rename menus from time to time; if a label differs, search the
provider's docs for the feature name in bold.

---

## 1. Environment variables

Names only. Values never go into the repository, chat, or tickets.

### Portal (Vercel project for `apps/portal`)

| Variable | Needed | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Pooled Postgres connection (Supabase pooler, port 6543) |
| `DIRECT_URL` | yes | Direct Postgres connection (schema changes at deploy) |
| `BETTER_AUTH_SECRET` | yes | Long random secret, the same in portal, website and API |
| `BETTER_AUTH_URL` | yes | The portal's public address, e.g. `https://portal.example.com` |
| `NEXT_PUBLIC_PORTAL_URL` | yes | The portal's public address (links in emails and printouts) |
| `NEXT_PUBLIC_WEBSITE_URL` | yes | The website's public address (customer links) |
| `NEXT_PUBLIC_ORGANISATION_NAME` | yes | Name on the sign-in pages, e.g. `Kewalram Chanrai Group` |
| `CRON_SECRET` | yes | Long random secret for the scheduled jobs |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | yes | Outgoing email |
| `PLATFORM_OWNER_EMAIL` | yes | The platform owner account |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | optional | Instant notifications |
| `BETTER_AUTH_TRUSTED_ORIGINS` | optional | Extra addresses allowed to sign in (e.g. the `vercel.app` address next to a custom domain) |
| `SERVER_ACTIONS_ALLOWED_ORIGINS` | optional | Only if a proxy in front changes the host name |
| `AUTH_SIGNIN_PER_MINUTE`, `AUTH_RESET_REQUESTS_PER_5_MIN` | optional | Sign-in limits per address (defaults 20 and 5) |
| `ENYO_LLM_BASE_URL`, `ENYO_LLM_API_KEY`, `ENYO_LLM_MODEL` | for Enyo | The AI model server (any OpenAI-compatible endpoint; the model must support tool calling). Without them Enyo shows "not switched on yet" and everything else works as before |
| `ENYO_LLM_FAST_MODEL`, `ENYO_LLM_PROVIDER_LABEL`, `ENYO_LLM_TIMEOUT_MS`, `ENYO_REQUESTS_PER_MINUTE` | optional | A smaller model for briefs and refinement; the name shown on Settings → Enyo; the per-request time limit; questions per person per minute (default 20) |
| `ENYO_WEB_LOOKUP` | optional | `off` stops Enyo looking up general knowledge (Wikipedia, free, no key; only the topic words are sent). On by default, in the portal and on the website |
| `SERPER_API_KEY` or `BRAVE_SEARCH_API_KEY` or `TAVILY_API_KEY` | optional | A general web search engine for Enyo alongside Wikipedia (Google via serper.dev, Brave, or Tavily — the first set is used): business leaders and their public profiles, company news. Only the topic words are sent; results that do not match the question are dropped. Set in Vercel for the portal and the website |
| `MAILBOX_ENCRYPTION_KEY` | for Mail | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts connected mailbox passwords. Changing it disconnects every mailbox |
| `ML_SERVICE_TOKEN` | for Enyo models | At least 32 random characters. Lets the trainer (GitHub workflow "Train Enyo models") read the de-identified history and hand in models (docs/ML.md). Unset = /api/ml answers 404. The same value goes in the GitHub secret `ML_SERVICE_TOKEN`; rotate both together |

### Website and customer portal (Vercel project for `apps/website`)

| Variable | Needed | What it is |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | yes | As above |
| `BETTER_AUTH_SECRET` | yes | The same value as the portal |
| `NEXT_PUBLIC_WEBSITE_URL` | yes | This site's public address |
| `NEXT_PUBLIC_PORTAL_URL` | yes | The portal's address (the "Employee login" button) |
| `NEXT_PUBLIC_ORGANISATION_NAME` | yes | Display name: header, footer, page titles, emails |
| `NEXT_PUBLIC_ORGANISATION_LEGAL_NAME` | optional | Registered name for the copyright line |
| `NEXT_PUBLIC_ORGANISATION_FOUNDED_YEAR` | optional | Shows the "years of excellence" badge |
| `NEXT_PUBLIC_SITE_TAGLINE`, `NEXT_PUBLIC_SITE_DESCRIPTION` | optional | Page title suffix and search description |
| `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_CONTACT_PHONE`, `NEXT_PUBLIC_CONTACT_ADDRESS` | optional | Footer contact lines (hidden when not set) |
| `NEXT_PUBLIC_SOCIAL_FACEBOOK`, `_LINKEDIN`, `_X`, `_YOUTUBE`, `_INSTAGRAM` | optional | Footer social links (hidden when not set) |
| `SMTP_*` | yes | Outgoing email (customer password reset) |
| `CUSTOMER_SIGNIN_PER_MINUTE`, `CUSTOMER_RESET_REQUESTS_PER_5_MIN` | optional | Sign-in limits per address |
| `ENYO_LLM_BASE_URL`, `ENYO_LLM_API_KEY`, `ENYO_LLM_MODEL` (and the optional ones) | for Enyo | The same model settings as the portal, for the customer-portal and website assistants |
| `WEBSITE_ORGANISATION_SLUG` | for Enyo | The organisation the public website belongs to (its slug in the database). Without it the website assistant stays off when the names don't match |
| `ENYO_IP_HASH_KEY` | recommended | A long random secret used only to hash visitors' addresses for rate limits |
| `ENYO_CUSTOMER_PER_MINUTE`, `ENYO_PUBLIC_PER_MINUTE`, `ENYO_PUBLIC_PER_DAY`, `ENYO_PUBLIC_IP_PER_MINUTE`, `ENYO_PUBLIC_IP_PER_DAY` | optional | Chat limits (defaults 12, 6, 60, 20, 200) |

### API (Render service for `apps/api`)

| Variable | Needed | What it is |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | yes | As above |
| `NEXT_PUBLIC_PORTAL_URL` | yes | The only browser origin allowed to call the API. The API refuses to start in production without it. |
| `NODE_ENV` | yes | `production` |
| `PORT` | set by Render | |

### Never in production
`MAILBOX_ALLOW_INSECURE` is for the CI test mail server only. The portal ignores it on a production build outside CI, but it should never be set on Vercel, Render or a company server.

### Rules that apply to every project

- **[Before release]** In Vercel → Project → **Settings → Environment Variables**,
  give each variable the right **Environments** (Production, Preview, Development).
  Production secrets should not be visible to Preview deployments: previews are
  built from any branch.
- **[Before release]** Mark secrets as **Sensitive** when adding them (Vercel
  then never shows the value again).
- `NEXT_PUBLIC_*` values are built into the pages. After changing one,
  **redeploy** the project.
- A production build on Vercel **stops with a clear message** when a required
  variable above is missing (`next.config.ts` in each app). The live site keeps
  running on the previous deployment until the variable is set and you redeploy.

---

## 2. Vercel (portal and website)

### Plan

- **[Before release]** Vercel's Hobby plan is for personal, non-commercial use.
  A company system belongs on **Pro**. Pro also unlocks Spend Management, more
  firewall rules, and longer rollback history.

### Node.js version

- **[Before release]** The repository now asks for **Node 24** (`engines` in
  `package.json`, `.node-version`). Vercel follows `engines`, so nothing needs
  changing. Check after the first deploy: Project → **Settings → Build and
  Deployment → Node.js Version** shows 24.x, and the build log prints it.
  Node 20 reached end of life on 30 April 2026 and Vercel deprecated it on
  1 October 2026.

### Spend Management (Pro)

**[Before release]**
1. Team → **Settings → Billing → Spend Management**: turn it on.
2. Set the **On-Demand Budget** (monthly, USD) to the most you are willing to pay
   above the plan's included credit.
3. Notifications at 50 %, 75 % and 100 % are switched on automatically; add SMS
   under **Settings → My Notifications**.
4. Decide on **Pause Production Deployments**. When on, both sites stop serving
   (503) once the budget is reached, until each project is resumed by hand. For a
   business system, a notification plus a webhook is usually better than an
   automatic outage; set the budget high enough that pausing is a last resort.

Vercel checks spend every few minutes, so actions can trigger a few minutes late.

### Firewall (WAF)

The code already limits sign-in attempts per address (20 a minute) and form
submissions (120 a minute per person) on each server instance. The firewall adds
a limit across all instances, at the edge, before a function even starts (which
also saves cost).

**[Before release]** Project → **Firewall** → **Configure** → **+ New Rule**, then
**Review Changes → Publish**. One rule each:

| Project | Name | If | Then |
|---|---|---|---|
| Portal | Sign-in flood | Request Path starts with `/api/auth/` | **Rate Limit**, Fixed Window, 60 s, 30 requests, key IP, action Default (429) |
| Website | Customer sign-in flood | Request Path starts with `/api/auth/` | Rate Limit, 60 s, 30, IP |
| Website | Customer portal flood | Request Path starts with `/customer-portal` and Method equals `POST` | Rate Limit, 60 s, 60, IP |

Start each rule with the **Log** action for a day, check the Firewall overview
for false positives (an office sharing one internet address), then switch it to
the 429 action. Hobby allows only one rate-limit rule per project (use the
`/api/auth/` one); Pro allows 40.

**[Recommended]**
- Keep Vercel's managed protections on (Firewall → **Bot Protection** /
  managed rulesets, where your plan offers them).
- **Attack Challenge Mode** (Firewall page, top right): leave off normally; turn
  on during an active attack. It challenges every visitor with a browser check.
  Afterwards, confirm the scheduled jobs (`/api/cron/*`) still ran; if your plan's
  documentation says challenged requests include them, add a bypass rule for
  `/api/cron/` (they are protected by `CRON_SECRET` anyway).
- Add a custom rule to **Deny** requests to paths that never exist in this app
  and are common attack probes (`/wp-admin`, `/.env`, `/phpmyadmin`).

### Deployment Protection

- **[Before release]** Project → **Settings → Deployment Protection** →
  **Vercel Authentication**: on, **Standard Protection**. Preview deployments
  (every pull request) then need a Vercel login. Previews use real environment
  variables, so they must not be public.
- Production stays public (people need to reach the sign-in pages).

### Rollback

- **[Before release]** Know the steps: Project → **Deployments** → choose the
  last good production deployment → **⋯** → **Instant Rollback** (or
  **Promote**). Takes seconds; no rebuild. Hobby can roll back only to the
  previous production deployment; Pro to any earlier one.
- A rollback does not undo database changes. Schema changes in this project are
  additive only (no columns or tables are dropped at deploy), so older code keeps
  working against the newer database.

### Custom domain

- **[Recommended]** Add the company's domains under Project → **Settings →
  Domains** (for example `portal.example.com` and `www.example.com`). Then set
  `BETTER_AUTH_URL`, `NEXT_PUBLIC_PORTAL_URL` and `NEXT_PUBLIC_WEBSITE_URL` to the
  new addresses in **both** projects and the API, update the Supabase scheduler
  (`scripts/v25-supabase-scheduler.sql`) and redeploy. Keep the old `vercel.app`
  address working by listing it in `BETTER_AUTH_TRUSTED_ORIGINS` during the move.
- **HSTS preload**: both apps send
  `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
  Submitting the domain to the browsers' preload list (hstspreload.org) makes
  HTTPS permanent for the domain **and every subdomain**, and is slow to undo.
  Submit only when every subdomain of the company domain serves HTTPS (email
  webmail, intranet and similar included). Until submitted, the `preload` word has
  no effect.

---

## 3. Render (API, `apps/api`)

- **[Before release]** Service → **Settings → Health Check Path**:
  `/api/v1/health`. It checks the database too, so a deploy whose database
  connection fails is not switched in; the previous version keeps serving.
- **[Before release]** Node version: Render reads `.node-version` (now `24`).
  Confirm in the next deploy log.
- **[Before release]** Environment: `NEXT_PUBLIC_PORTAL_URL`, `NODE_ENV=production`,
  `DATABASE_URL`, `DIRECT_URL`. The API will not start without the portal
  address in production.
- **[Recommended]** Scaling: one instance is enough today (the portal does not
  call the API). Leave autoscaling off until there is a client for the API; the
  per-instance rate limit then also stays meaningful.
- **Rollback**: Service → **Events** → the last good deploy → **Rollback**.
- **[Recommended]** Turn on deploy notifications (Service → **Settings →
  Notifications**) so a failed deploy is noticed.

---

## 4. Supabase (database)

Authentication is handled by the app (Better Auth), not by Supabase Auth, so
Supabase's own auth settings (leaked-password protection, auth rate limits,
email templates) do not apply.

### Backups and restore

- **[Before release]** Know your plan's backups: **Database → Backups**. Pro
  includes daily backups kept for 7 days. The Free plan has no downloadable
  backups: on Free, run a scheduled `pg_dump` to storage you control, or move to
  Pro.
- **[Recommended]** **Point-in-Time Recovery** (Project → **Settings →
  Add-ons**): restore to any second, not just the daily copy. Worth it once real
  money and job cards are in the system.
- **[Before release]** Test a restore once, and write down the date:
  1. Create a new, empty Supabase project (or a local Postgres 16).
  2. Restore the latest backup into it (Database → Backups → **Restore** into the
     new project, or `pg_restore` from a dump).
  3. Point a local copy of the portal at it (`DATABASE_URL`/`DIRECT_URL`), sign in,
     open a few job cards and the audit log.
  4. Delete the test project. Never restore over production to "test".

### Network and connections

- **[Before release]** **Database → Settings → SSL Configuration**: turn on
  **Enforce SSL on incoming connections**. Then make sure both connection strings
  work (add `sslmode=require` if a client complains).
- **[Recommended]** **Database → Settings → Network Restrictions**: allow only
  the addresses that need the database. Vercel and Render use changing
  addresses on standard plans, so this can only be tightened if you use fixed
  outbound addresses (Vercel Secure Compute, Render static outbound IPs) or
  accept that it stays open; SSL plus strong passwords then carry the load.
- **[Recommended]** Connection pooler (**Database → Settings → Connection
  pooling**): the apps connect through the pooler (port 6543,
  `pgbouncer=true`). Keep the pool size within the plan's limit; if Vercel
  functions report "too many connections" under load, lower the pool size or add
  `connection_limit=1` to `DATABASE_URL` for the serverless apps.
- **[Recommended]** Rotate the database password if it was ever shared, then
  update `DATABASE_URL`/`DIRECT_URL` everywhere.

### Data API

- Every table has row-level security switched on with no policies, and the
  `anon` / `authenticated` roles have no rights
  (`scripts/postdeploy/0001-rls-default-deny.sql`, run after every production
  deploy, so new tables are covered). The public API key therefore reads nothing.
- **[Recommended]** If instant notifications are not used, switch the Data API off
  (Project → **Settings → Data API**) or remove `public` from the exposed
  schemas. If they are used, keep it on: Realtime pings carry no business data.

### Account

- **[Before release]** Turn on MFA for every Supabase account with access to the
  organisation, and remove people who no longer need it.
- **[Recommended]** Set a spend cap / usage alerts under the organisation's
  **Billing** page.

---

## 5. GitHub

- **[Before release]** Protect `main`: **Settings → Rules → Rulesets → New
  branch ruleset** (or **Settings → Branches → Add branch protection rule**),
  target `main`:
  - Require a pull request before merging (at least one approval).
  - Require status checks to pass, with these checks: `build` (CI),
    `e2e (shard 1/2)`, `e2e (shard 2/2)`, `secrets`, `sast`, `dependencies`,
    `dynamic` (Security). `load` is informational and can stay optional.
  - Block force pushes and deletions.
- **[Before release]** **Settings → Code security**: turn on **Secret scanning**
  and **Push protection** (blocks a push that contains a credential), and
  **Dependabot alerts**. Dependabot security updates are optional; CI also
  reports `npm audit` on every pull request.
- **[Recommended]** Require MFA for everyone in the GitHub organisation.

---

## 6. After each release

- [ ] Production deploy succeeded on both Vercel projects and on Render.
- [ ] `https://<portal>/api/health` and `https://<api>/api/v1/health` answer `ok`.
- [ ] Sign in to the portal, open the dashboard, sign out.
- [ ] Customer portal sign-in page loads; "Forgot password" email arrives.
- [ ] Response headers on the portal include `Content-Security-Policy` with a
      `nonce-` value and `x-request-id`.
- [ ] Firewall overview shows no unexpected blocks.
