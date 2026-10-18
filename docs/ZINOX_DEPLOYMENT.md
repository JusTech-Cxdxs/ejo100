# Deploying EJO 100 — Zinox Technologies edition

Two apps go live: the **Staff portal** (`apps/portal`) and the **Customer & Dealer portal** (`apps/website`,
whose root now opens the portal sign-in; there is no public marketing site in this edition). The database is
Supabase Postgres. The NestJS API (`apps/api`) on Render is optional — nothing in the portals calls it.

Do the steps in this order. Values in `<angle brackets>` are yours to fill in.

## 0. GitHub (once)
1. On github.com create an empty private repository **JusTech-Cxdxs/zinox-ejo100** (no README).
2. From a machine with the `ejo100` repository:
   ```sh
   git fetch origin zinox-edition
   git push https://github.com/JusTech-Cxdxs/zinox-ejo100.git zinox-edition:main
   ```
   The whole edition lives on that branch. Protect `main`, turn on secret scanning and push protection.
   Install the Claude GitHub App on the new repository if you want Claude to keep working in it.

## 1. Supabase (database)
1. Create a project (region: Frankfurt, to match the Vercel region `fra1`). Note the database password.
2. Project Settings → Database: copy the **pooled** connection string (port 6543, add `?pgbouncer=true`) as
   `DATABASE_URL` and the **direct** one (port 5432) as `DIRECT_URL`.
3. Turn on **Enforce SSL**, MFA for the dashboard accounts, and backups / PITR.
4. Create the schema and the reference data from your machine (Node 24, repository checked out):
   ```sh
   npm install
   export DATABASE_URL='<direct string>' DIRECT_URL='<direct string>'
   for f in scripts/predeploy/*.sql;  do npx prisma db execute --file="$f" --url="$DIRECT_URL"; done
   npx prisma db push --schema=packages/database/prisma/schema.prisma --skip-generate
   for f in scripts/postdeploy/*.sql; do npx prisma db execute --file="$f" --url="$DIRECT_URL"; done
   MASTER_ADMIN_NAME='Platform Administrator' MASTER_ADMIN_EMAIL='<your admin email>' MASTER_ADMIN_PASSWORD='<long password>' \
     npm run seed --workspace=packages/database
   npx prisma db execute --file=scripts/v24-roles.sql --url="$DIRECT_URL"
   ```
   The seed creates **Zinox Technologies Limited** (slug `zinox-technologies`), the Gbagada Plant & Head
   Office and the Abuja Regional Office, every department and role, the Master Administrator, and the
   catalogue: 22 products (Prestige Pro2, Elite Pro2, Phoenix, Bijimi Pro, Phantom, Apex Pro2, Quantum Pro2,
   Zpad X9 Pro / X9 / Kids Legacy, monitor, Smart Board, iPower inverters, battery, panel and kit, iTEC
   generator, TVs, fan, stabiliser), their configurations, the laptop bills of materials and software, the
   line and QA checklists, finished-goods locations, warranty policies, suppliers, and the retail and dealer
   Tier 1 price lists. Run it again any time: it only adds what is missing.
5. Project Settings → API: copy the **Project URL** and **anon key** (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`) — optional, for instant notifications.
6. **After the portal is live** (step 2.6): SQL Editor → run `scripts/v25-supabase-scheduler.sql` with your
   `CRON_SECRET` and portal address pasted in, then `scripts/v36-support-scheduler.sql`. Check
   `select status_code, created from net._http_response order by created desc limit 5;` shows 200s.

## 2. Vercel — Staff portal
1. New project from the repository, **Root Directory `apps/portal`**, Node 24, Pro plan for commercial use.
2. Build command: `cd ../.. && npm install && npm run build --workspace=packages/database && node scripts/db-push-if-vercel.js && npm run build --workspace=apps/portal`
   (the db-push step applies predeploy SQL → schema → postdeploy SQL on every production build; it never drops data).
3. Environment variables (Production; mark secrets Sensitive):
   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` / `DIRECT_URL` | from Supabase |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 48` — the **same** value in both Vercel projects |
   | `BETTER_AUTH_URL`, `NEXT_PUBLIC_PORTAL_URL` | `https://<portal domain>` |
   | `NEXT_PUBLIC_WEBSITE_URL` | `https://<customer portal domain>` |
   | `NEXT_PUBLIC_ORGANISATION_NAME` | `Zinox Technologies` |
   | `NEXT_PUBLIC_APP_SHORT_NAME` | `Zinox` |
   | `PLATFORM_OWNER_EMAIL` | your email |
   | `CRON_SECRET` | `openssl rand -base64 32` |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | your mail provider; `SMTP_FROM="Zinox Technologies <no-reply@zinoxtechnologies.com>"` |
   | `MAILBOX_ENCRYPTION_KEY` | `openssl rand -base64 32` |
   | `ENYO_LLM_BASE_URL`, `ENYO_LLM_API_KEY`, `ENYO_LLM_MODEL` | any OpenAI-compatible model server (e.g. Groq for a trial); leave unset and Enyo shows "not switched on yet" |
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | optional |
4. Deploy. The crons in `apps/portal/vercel.json` (pricing alerts and housekeeping 07:00 UTC, appointment
   digest 06:00 weekdays, **dealer price broadcast 07:00 Monday–Saturday**) are picked up automatically.
5. Add the custom domain, then update `BETTER_AUTH_URL`, `NEXT_PUBLIC_PORTAL_URL` and
   `NEXT_PUBLIC_WEBSITE_URL` in both projects and redeploy (`NEXT_PUBLIC_*` values are built into the pages).
6. Firewall: rate-limit rule on `/api/auth/`; Deployment Protection on previews; Spend Management.

## 3. Vercel — Customer & Dealer portal
1. New project, **Root Directory `apps/website`**, Node 24.
2. Build command: `cd ../.. && npm install && npm run build --workspace=packages/database && npm run build --workspace=apps/website`
3. Variables: `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET` (same value), `NEXT_PUBLIC_WEBSITE_URL`,
   `NEXT_PUBLIC_PORTAL_URL`, `NEXT_PUBLIC_ORGANISATION_NAME=Zinox Technologies`,
   `WEBSITE_ORGANISATION_SLUG=zinox-technologies`, `NEXT_PUBLIC_ACTIVE_ORGANISATION_SLUG=zinox-technologies`,
   `SMTP_*` (same), `ENYO_LLM_*` (same), `ENYO_IP_HASH_KEY` (`openssl rand -base64 32`).
4. Deploy, add the domain, add firewall rules for `/api/auth/` and POSTs to `/customer-portal`.

## 4. Render — API (optional)
1. Web service from the repository. Build: `npm install && npm run build --workspace=packages/database && npm run build --workspace=apps/api && node scripts/db-push-if-render.js`.
   Start: `npm run start:prod --workspace=apps/api`. Health check path `/api/v1/health`.
2. Variables: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_PORTAL_URL`, `NODE_ENV=production`.

## 5. First sign-in
1. Open the portal, sign in as the Master Administrator from the seed.
2. Users → add your people and give them roles (Sales Officer, Production Planner, Line Supervisor, QA
   Inspector, Finished Goods Officer, Billing Officer, Finance Manager, …). Each gets a welcome email with a
   set-password link.
3. Organisation → check the letterhead details (legal name, RC number, hotlines); they print on every document.
4. Customers → register your dealers and open the Dealer account (tier, credit); they receive the price
   broadcast every morning and can sign in to the Customer & Dealer portal.
5. Catalogue → adjust prices on the price lists, then "Publish today's dealer prices".

## 6. Checks
* `/api/health` on the portal answers `ok`; the customer portal sign-in page loads; a reset email arrives.
* RUNBOOKS §2 queries return 0 rows; no public tables under Database → Replication in Supabase.
