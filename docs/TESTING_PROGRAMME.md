# EJO100 — Security, Concurrency and Load Testing Programme

**Date:** 12 October 2026 · **Branch:** `work/testing` · **Tester:** independent workstream, not the authors of the code under test.
**Where it runs:** `.github/workflows/security.yml`. It runs on every pull request to `main` and on every push to `work/testing`. Everything runs against throw-away CI services: Postgres 16, Mailpit, `next start` and the NestJS API on the runner. **Nothing was run against Vercel, Render or Supabase.**
**Evidence** is reported as GitHub annotations, readable through the API: `gh api repos/{o}/{r}/check-runs/{id}/annotations`. It also goes into each job's summary. The numbers below come from run **38209691735**, commit `e59e9b9`. All five jobs were green.

## 1. Summary

| Area | Result |
|---|---|
| Secrets (gitleaks, 1,928 commits on all refs + working tree; client bundles) | **1 High (owner action):** a real-looking Master Admin password sits in git history (SEC-01). No secret values in the client bundles, no source maps, and no secrets in server logs. |
| Static analysis (Semgrep: registry packs + 6 project rules) | 1 true positive, an open redirect (SEC-02). **Fixed** in `ea33556`, and CI now blocks a regression. Everything else triaged (§4). |
| Dependencies (npm audit) | No critical. The 4 high findings in production code sit in the NestJS API or in Next's build-time postcss, and none is reachable (DEP-01..03). Only major upgrades clear them. |
| DAST (OWASP ZAP baseline: portal signed out 29 URLs, signed in as administrator 535 URLs, website 163 URLs) | No High. The Medium findings are the Content-Security-Policy (SEC-04) and a false-positive anti-CSRF alert on server-action forms. 2 Low header findings. |
| Access control (HTTP / server-action level) | **Held everywhere** (role × page matrix, cross-organisation pages and print views, 1,598-call IDOR sweep, signed-out sweep of all 604 server actions, privilege escalation, cron). Two weaknesses found, neither a data leak: the middleware can be bypassed with a ".json" path (SEC-03), and 76 actions run code before checking sign-in (SEC-12). |
| Database exposure (Supabase `anon` / `authenticated`) | **Held.** RLS is on for 93 of 93 tables. There are 0 grants, 0 sequence rights and 0 default privileges, and all 744 live attempts were refused. A negative control proves the test can fail. |
| Concurrency / idempotency (real server actions, real Postgres) | **Every integrity invariant held** (11 checks). One usability finding: under a burst, Job Card creation hits number clashes and 9 of 15 users get an error (CONC-01). |
| Load (k6, one instance on a 2-vCPU runner) | 0 errors in every stage. The proposed SLOs are met at 10, 25 and 50 virtual users (search excepted). They are breached in the 120-user spike. Latency is back to baseline within seconds of the spike ending. A two-instance failover saw 0.45 % errors in the 10 s after one instance was killed, then 0 %. |
| Error handling / logging | One structured JSON line per unexpected error (`instrumentation.ts`), plus about 80 unstructured `console.error` calls. There is no request id, no website error boundary, and no portal health endpoint (LOG-01..05). |

**CI status:** all jobs green. The only failure ever raised was the open redirect, which failed `sast` and `dynamic` until it was fixed, as intended. The Medium/Low findings below are reported as warnings and do not fail CI. A new secret, a project-rule ERROR (raw SQL, open redirect, SSRF), a leak or change in any access-control sweep, a broken DB invariant, or a regression in RLS or grants **fails CI**.

## 2. Findings register

Severity reflects real exploitability in this application, not the scanner's label.

| ID | Sev | Finding | Evidence | Status / fix |
|---|---|---|---|---|
| **SEC-01** | **High** | A real-looking `MASTER_ADMIN_PASSWORD` (11 chars, starts "Om…") was committed to `.env.example`. It was added in `49a5753` (26 Jul 2026), was still there in `2df9dcc` / `da8ddc6` (16 Aug), and was removed in `5ad3956` (12 Oct). It remains in history, visible to anyone with read access to the repository. | gitleaks project rule `ejo-app-secret-assignment` over all refs. Value redacted; fingerprints are in `.gitleaksignore`. | **Owner action:** treat the password as compromised. Change the Master Admin password in every environment and confirm nobody reuses it elsewhere. A history rewrite is optional because the repository is private. Listed in `.gitleaksignore` so that CI fails only on **new** leaks. |
| SEC-02 | Low | Open redirect: `setPartStockLevelsFormAction` redirected to `returnTo` from the form unchecked (`apps/portal/lib/actions/store-form-handlers.ts:321`). Exploitation needs a same-origin POST, because Next's server-action Origin check blocks cross-site forms, so the severity is Low. | Semgrep `ejo-redirect-user-input`. CI `AC-REDIR`: before the fix, `returnTo=https://evil.example/phish` gave a 303 to `https://evil.example/phish?status=levels_set`. After the fix it goes to `/inventory/parts/<id>?status=levels_set`. | **Fixed** in `ea33556`: only an `/inventory/…` path is accepted. Guarded by the Semgrep rule and AC-REDIR. |
| SEC-03 | Medium | The middleware matcher skips **any** path ending in a "static" extension (`apps/portal/middleware.ts:98`: `.json`, `.css`, `.js`, `.png`, …). A POST to `/print/job-cards/x.json` with a `Next-Action` header reaches the page's server actions, about 180 of them, with **no login redirect and no flood limit**. Action-level authorisation still holds (AC-ANON). | CI `AC-MW`: the normal path gives 307 to `/login`; the ".json" path gives 200 and the action ran. `AC-RATE`, 130 POSTs in one session: `/dashboard` got 16 × 429, `/print/job-cards/x.json` got **0 × 429**. | Open (lead). Exclude extensions only under real static prefixes, e.g. `'/((?!_next/static\|_next/image\|favicon\\.ico\|images/).*)'`, and let the middleware return early for GET requests of static files. Alternatively, rate-limit POSTs with a separate matcher that has no extension exclusion. |
| SEC-04 | Medium | The CSP has no `default-src`, `script-src` or `style-src`, so it gives no XSS mitigation (`apps/portal/next.config.ts:33`, `apps/website/next.config.ts:21`). | ZAP 10055 on portal (signed out and signed in) and website: "Wildcard Directive", "script-src unsafe-inline", "style-src unsafe-inline". | Open. Add a nonce-based CSP in middleware (Next's documented pattern): `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'self'`. Start with `Content-Security-Policy-Report-Only`. |
| SEC-05 | Low | `Cross-Origin-Resource-Policy` and `Cross-Origin-Embedder-Policy` are not set. | ZAP 90004 (portal and website). | Open. Add `Cross-Origin-Resource-Policy: same-origin` to the portal. COEP is optional. |
| SEC-06 | Low | Flood limits are in memory, per instance, and keyed on `x-forwarded-for` (`middleware.ts:37`). With N serverless instances the limit is N × 120 per minute. Behind anything other than Vercel's edge, the address can be spoofed. Better Auth's sign-in limit is also per instance. | Code review. The CI tests rotate `x-forwarded-for` and are never throttled per address. | Accepted for V1 (documented WAF plan). For a real global limit, use Vercel WAF rate-limit rules or a shared store (Upstash/Redis). |
| SEC-07 | Low | The Supabase Realtime broadcast topic `ejo-changes` (`apps/portal/lib/realtime-ping.ts:13`) is one global, public topic, and anyone holding the public anon key can publish to it. A spammer makes every open tab refresh: coalesced, so roughly 1 refresh per gap per tab. It carries no data. | Code review. | Open. Use a private channel (Realtime Authorization) or a per-organisation topic; the server could publish with a server-only key. |
| SEC-08 | Low | `GET /signed-out` clears the session, which allows logout CSRF (`apps/portal/app/signed-out/route.ts:12`). | Code review. | Accept, or make it POST. |
| SEC-09 | Low | The API's `/api/v1/health` returns the raw database error message to unauthenticated callers, e.g. the database host (`apps/api/src/modules/health/health.controller.ts:28`). | Code review. Health returned 200 in CI; the error path was not triggered. | Open. Log the message and return `{status:'error'}` only. |
| SEC-10 | Low | `branchInMyOrganisationOrSystem` **fails open** for a signed-out caller: no session means `organisationId` is null, which returns `true` (`apps/portal/lib/workshop-core.ts:202-207`). This is safe today only because every caller then calls `requireUser()`. | Code review. AC-ANON confirms that no action returned data signed out. | Open, defence in depth. Return `false` when there is no session (add `signedIn` to `whereIWork`). |
| SEC-11 | Info | 26 exported functions in `'use server'` files have no visible guard in their own body. All 26 were reviewed: each reaches `requireUser`/`authorize` through a helper (`me()`, `getSchedulingAccess`, `myOrganisationBranches`, `listEligible…Uncached`, `branchInMyOrg`, `search…Options`). Helpers such as `requireStoreStaff` are themselves exported as callable actions. | Semgrep `ejo-server-action-without-guard` (warning). Dynamically, AC-ANON: none of the 604 actions returned data signed out. | Accepted. Move non-action helpers out of `'use server'` modules. |
| SEC-12 | Low | **76 server actions run code before checking sign-in**: a DB lookup by the supplied id, or input parsing. Examples: `approveJobCard`, `approveCancellationRequest`, `deletePartFitment`, `updateGoodsReceipt`, `recordGoodsReceipt`, `createPart`. A signed-out caller can trigger queries, and form handlers echo the reason ("…not found" vs "Not authenticated"), which is an existence oracle for ids. CUIDs are unguessable, so the impact is low. | CI `AC-ANON-ORDER`: 76 actions, each listed with its refusal reason from the server log. | Open. Call `await requireUser()` first in every exported action; it is cheap, because the session is cached per request. |
| SEC-13 | Info | `tsconfig.tsbuildinfo` files are tracked in git. Semgrep registry flags `detected-facebook-oauth` in them; this is a false positive on hashes. | Semgrep registry (CI). | Untrack them (`git rm --cached`); `.gitignore` already lists them. |
| CONC-01 | Medium | Job Card numbers come from `max(jobNumber)+1` over **one global sequence for all organisations** (`apps/portal/lib/actions/workshop.ts:897`), retried 5 times on a clash (`:1167`). With 15 simultaneous creations for 15 different vehicles, **only 6 succeed** and 9 users get "Unique constraint failed on jobNumber". There is no duplicate or corruption. The same `max+1` pattern exists for service, GRN, PRS, EPR, refund and broadcast numbers (`vehicle-service.ts:40`, `store.ts:137`, `sourcing.ts:251/264`, `refunds.ts:174`, `notifications.ts:256`). | CI `CONC-04`: created 6/15, unique numbers 6/6, refusal reasons taken from the server log. | Open (lead). Take a per-prefix counter row inside the transaction (`UPDATE counters SET n = n + 1 WHERE key = 'JC-2026' RETURNING n`), or `pg_advisory_xact_lock(hashtext('JC-2026'))` before reading the max. Cheaper stop-gap: random back-off between retries and more attempts. |
| CONC-02 | Info | A goods receipt submitted 20 times at once with the same idempotency key records **one** receipt (stock +4 once). The 19 concurrent duplicates are refused by the unique index (raw P2002) instead of being answered "already recorded". The form handler maps that error to a friendly message, so users see it right. | CI `CONC-08`. | Accept, or check the key again inside the transaction, as `recordPayment` does. |
| RLS-01 | Pass | Supabase exposure holds. See §6. | CI RLS-01..08, plus a local negative control. | — |
| RLS-02 | Info | A table created by `prisma db push` has RLS **off** until the post-deploy SQL runs again in the same deploy. Default privileges are revoked, so `anon` / `authenticated` still have no grants on it, and it is not exposed. | CI `RLS-08`: anon SELECT=false, authenticated INSERT=false on a probe table created after the deploy SQL. | Accepted. Keep the post-deploy step in every deploy path. |
| LOAD-01 | Medium | A **single instance saturates at about 42 requests per second** of the mixed workload. In the 120-user spike, p95 reaches pages 3.6 s, pulse 1.4 s, search 9.3 s and sign-in 2.0 s. All proposed SLOs are breached, but there are 0 errors. | k6 stage table (§7). | Expected for one 2-vCPU instance. Production capacity depends on Vercel's concurrency; re-measure on staging. |
| LOAD-02 | Medium | **Global search is the slowest operation**: p95 2.0 s already at 50 users (ramp), and p50 5.3 s in the spike. | k6 `kind:search` (`globalSearch` server action). | Open. Profile `lib/actions/search.ts`: run the per-module queries in parallel, add `pg_trgm` GIN indexes for `ILIKE '%q%'`, and cap the result count. |
| LOAD-03 | Low | The write workflow (create, stop and delete a broadcast, 165 operations) has p95 2.7 s, against a proposed 2 s. | k6 `kind:write`. | Watch. Emails and realtime pings already run after the response. |
| LOAD-04 | Info | **Not verified:** horizontal scaling and production load balancing. The two-instance check uses a tiny proxy (`ops/load-test/lb.mjs`), not Vercel. Its result is in §7. | — | Re-run `ops/load-test/k6-portal.js` against staging. |
| LOG-01 | Medium | About 80 `console.error(…, err)` calls log **raw error objects**, unstructured and un-redacted. They bypass `lib/errors.ts` `redact()`. Some include personal data: `app/api/cron/pricing-alerts/route.ts:78` logs `recipient.email`. | Code review: 88 `console.*` calls in the portal, 6 `logError(` calls. The CI log scan found no secret values and no emails in `portal.log` during the test run. | Open. Route every failure through `logError(where, err, extra)`, and never pass emails or tokens. |
| LOG-02 | Low | There is no request or correlation id. Only unhandled errors get a reference (the Next digest), which users see on the error page. Handled failures get `logError`'s random ref. | Code review. | Proposal below (§8). |
| LOG-03 | Low | The website has no `error.tsx` / `global-error.tsx` and no server logging at all, so the customer portal shows Next's default error page. | `find apps/website/app -name 'error.tsx'` returns nothing. | Open. Copy the portal's `(app)/error.tsx` and `global-error.tsx` patterns and add `instrumentation.ts`. |
| LOG-04 | Low | The portal and website have no health or readiness endpoint. The API has one (DB check), but see SEC-09. | Code review. | Proposal below (§8). |
| LOG-05 | Info | Besides the redacted JSON line, Next's own `⨯ Error` stderr block prints the **un-redacted** message and stack for every thrown action error. | `portal.log` in CI. | Accept, or send `console.error` through a redacting wrapper in `instrumentation.ts`. |
| DEP-01 | High (scanner) / Low (real) | Production advisories in `@nestjs/platform-express` → multer (DoS), `lodash` (via `@nestjs/config`) and `body-parser`. | `npm audit --omit=dev`: 4 high, 7 moderate, 1 low. | **Not reachable**: the API has no upload routes, never calls `_.template`/`_.unset`/`_.omit` on input, and sets no custom body limit. Fixed only by NestJS 11/12 (major). Patch/minor overrides are possible: `"overrides": { "multer": "^2.1.0", "lodash": "^4.18.1", "body-parser": "^1.20.6", "qs": "^6.15.4" }`. Not applied here, because the brief forbids `npm install` at the root; the lead should apply them and run CI. |
| DEP-02 | Moderate (scanner) / Low | `next` → bundled `postcss@8.4.31` (build-time only; processes our own CSS). `better-auth` is flagged only because of its peer dependency on `next`. | npm audit. | No fix inside Next 15 (15.5.27 is the latest 15.x). It clears with Next 16, which is a major upgrade. |
| DEP-03 | Moderate / Low | `qs` (express query parsing, API) and `file-type` (via `@nestjs/common`, used only by `FileTypeValidator`, which we do not use). | npm audit. | `qs`: minor override (above). `file-type` needs a major upgrade; not reachable. |

Out-of-scope observation (not a security defect): the portal unit test `data-inventory.test.ts` fails on the base branch. The v28 tables `CustomerVerification`, `CustomerNote` and `CustomerNotificationRead` are not declared in `lib/governance/data-inventory.ts`. That belongs to the CRM / customer-portal workstreams.

## 3. Secrets

**Commands (local, full mirror clone):**
`git clone --mirror …` gave 1,895 commits on 18 refs. Then `gitleaks git . --log-opts=--all --redact`:
- default rules: 1,596 commits scanned, **no leaks**;
- project config `.gitleaks.toml` (default rules plus Postgres URL with password, EJO secret assignments, Supabase JWT): **6 hits**, all in `.env.example` history. Four were placeholders (`password@db.your-project…`, `SUPABASE_SERVICE_ROLE_KEY="replace-me"`), now allow-listed. **2 were real-looking passwords (SEC-01)**, now in `.gitleaksignore` by fingerprint.

Custom history greps found no JWTs and no `.env`, `.pem` or `.key` files ever committed. Every Postgres URL with a password belongs to a placeholder or a CI database (`e2e-test-only`, `ci-test-only`, `user:password@localhost`).

**CI (`secrets` job):** gitleaks 8.28.0, release binary verified against its sha256. It scans all refs (`fetch-depth: 0`, 1,928 commits) and the working tree, and fails on any finding. Findings are annotated as file, line and rule, with the secret redacted.

**Client bundles.** The portal and website are built (locally, with **canary** values in every secret env var; in CI, with the CI secrets) and every file under `.next/static` is scanned by `apps/portal/e2e/security/bundle-scan.mjs`:
- **secret values:** none found for `BETTER_AUTH_SECRET`, `CRON_SECRET`, `SMTP_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `MASTER_ADMIN_PASSWORD`, or the DB password. A negative control (a planted canary) is detected;
- **secret-looking strings:** none (private keys, JWTs, DB URLs, AWS, Stripe, GitHub or Resend keys);
- **source maps:** 0. `productionBrowserSourceMaps` is not set;
- **env names in the bundle:** `BETTER_AUTH_SECRET`, `AUTH_SECRET`, `BETTER_AUTH_URL` and `BETTER_AUTH_TELEMETRY*`, plus `NEXT_PUBLIC_AUTH_URL` / `NEXT_PUBLIC_BETTER_AUTH_URL`. These are **names only**, from better-auth's client env helper (`Object.freeze({get BETTER_AUTH_SECRET(){return l("BETTER_AUTH_SECRET")}…})`), and they resolve to `undefined` in a browser. Safe.

**`NEXT_PUBLIC_*` variables used, and whether each is safe to be public:**

| Variable | Used in | Safe public? |
|---|---|---|
| `NEXT_PUBLIC_PORTAL_URL` | portal + website (links, emails) | Yes. A public URL. |
| `NEXT_PUBLIC_WEBSITE_URL` | portal + website (set-password links) | Yes. A public URL. |
| `NEXT_PUBLIC_SUPABASE_URL` | portal realtime (`lib/realtime-ping.ts`, `lib/hooks/use-change-pings.ts`) | Yes. The project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | portal realtime (inlined into the client bundle) | Yes, **because** RLS denies everything to `anon` (§6). Its only remaining power is the public broadcast topic (SEC-07). It must never be swapped for the service-role key. |
| `NEXT_PUBLIC_ACTIVE_ORGANISATION_SLUG` | website branding | Yes. A slug. |

## 4. Static analysis (Semgrep 1.180.0)

- **Registry packs** `p/typescript p/react p/nextjs p/secrets p/owasp-top-ten` run in CI only, because `semgrep.dev` is blocked from the sandbox. Result: 2 findings, both `detected-facebook-oauth` in tracked `tsconfig.tsbuildinfo`, both false positives (SEC-13). The pack is report-only.
- **Locally**, 425 community rules from `github.com/semgrep/semgrep-rules` (javascript, typescript, generic/secrets) gave 2,637 results:
  - 2,224 `jsx-not-internationalized`, 190 `missing-template-string-indicator`, 56 `i18next-key-format` and 31 `react-props-spreading` are style rules; not security.
  - 127 `html-in-template-string` sit in `lib/email-templates/*`. All are false positives: every interpolated value goes through `escapeHtml`, and the layout escapes `heading`, `previewText`, `footerNote` and `companyName`. Raw names appear only in plain-text preview strings, which `layout.ts:142` escapes.
  - 2 `raw-html-join` in the estimate emails are false positives: the items are escaped first.
  - `path-join-resolve-traversal` / `detect-non-literal-fs-filename` are in `scripts/apply-predeploy-sql.js`. False positives: build-time, fixed directory.
  - `no-stringify-keys` in `instrumentation.ts` and `react-props-in-state` in `useDebouncedValue` are false positives.
- **Project rules** (`.semgrep/ejo100.yml`, run in CI; **ERROR fails the build**). Every rule was checked against a planted positive file, and each one fired:

| Rule | Sev | Current findings | Triage |
|---|---|---|---|
| `ejo-prisma-raw-unsafe` (`$queryRawUnsafe` / `$executeRawUnsafe`) | ERROR | 0 | — |
| `ejo-prisma-raw-template-string` (`Prisma.raw(var)`, `$queryRaw(\`…\`)`, string concatenation) | ERROR | 0 | The 5 raw-SQL uses are tagged templates or `Prisma.sql` over a whitelist (`lib/integrity.ts` `LOCKABLE`). |
| `ejo-redirect-user-input` (`redirect()` to a form or query value that is not validated) | ERROR | 2 before the fix, **0 after** | True positive, SEC-02, fixed. The validated cases are correctly excluded: `structure-form-handlers.ts` (regex), `safeWorkshopPath`, `warranty-form-handlers.ts` (`=== 'list'`). |
| `ejo-fetch-user-url` (server `fetch` of request data, SSRF) | ERROR | 0 | The only server-side fetch is the Supabase broadcast to an env URL. |
| `ejo-dangerously-set-inner-html` | WARNING | 1 (`app/layout.tsx:20`) | False positive. A constant theme boot script; the website has the same. |
| `ejo-server-action-without-guard` | WARNING | 26 | All transitively guarded (SEC-11). Proven dynamically by AC-ANON. |

## 5. Access control (CI `dynamic` job: `apps/portal/e2e/security/access-control.ts`)

**How server actions are called.** `action-map.mjs` reads the `next build --no-mangling` output and maps every one of the build's **604** server-action ids to `{file, name, page}`. The tests then POST exactly as the browser does: a `Next-Action` header, React 19 `encodeReply` encoding (FormData fields as `_1_<name>`), and the session cookie. A refusal's reason is read from the portal's JSON error log by digest. **All results below are from CI run 38209691735.**

| Check | Result |
|---|---|
| **AC-CRON** (3 routes) | No header → 401. Wrong Bearer → 401. `?key=` / `?secret=` with the right value → 401. The right value without "Bearer" → 401. POST → 405. Correct header → 200. |
| **AC-PULSE** | Signed out: 307 to `/login` (middleware). Forged cookie: 401. |
| **AC-PAGES**: 11 accounts (every seeded role, Master Admin, the other organisation's admin) × 70 list pages = 770 requests. The oracle is the Authorization Catalogue `decide()` for the page's `guardPage` / `guardAnyPage` keys, plus its layouts. | **0 pages served to a role the catalogue denies; 0 refused that it allows.** |
| **AC-XORG**: the other organisation's admin (given *all* the first organisation administrator's grants) opens 24 first-organisation record pages and print views by id: Job Card, request-parts, estimate matching, Vehicle Service, part, part edit, goods receipt, parts request, warranty, warranty provider, warranty policy, vehicle edit, branch, broadcast, appointment, appointment edit, and `/print/{job-cards, job-cards/estimate, vehicle-service, vehicle-service/estimate, parts-requests, refunds, warranty}`. | **All 24 refused** (404 / not found / denied), with **no** first-organisation marker in any response. Positive control: the Master Admin sees the markers on 23 of 24. The VS estimate print needs a manager-approved service estimate, which the fixtures do not create. |
| **AC-IDOR**: every exported action taking one id string (**171 actions**) called by the other organisation's admin with first-organisation ids of the matching kind (**1,598 calls**). | **No first-organisation data in any answer; the database fingerprint was unchanged** (row count + md5 of 25 business tables). The non-empty answers were generic (`getInventoryAnalytics` default settings, `globalSearch` menu hits) or empty. Positive control: 12 Master Admin calls returned the markers. |
| **AC-ANON**: **all 604 actions** called with a *forged* session cookie (passes the middleware's presence check; form actions get id fields). | **No action returned data; no table changed.** Outcomes: 335 × "Not authenticated.", form handlers redirecting with an error, 7 empty answers (`getDashboardNotifications`=[], `getNotificationPulse`="", `canBroadcast`=false, two form handlers returning nothing when no technician is chosen), and 76 refused for another reason before sign-in (SEC-12). |
| **AC-PRIV**: Technician, and the other organisation's admin, attempt 11 privileged actions: `assignRole` (to Administrator), `grantRolePermission` (`admin.users.manage`, `admin.roles.manage`), `setStaffActive` (switch off the admin), `createStaffMember` (with the Administrator role), `updateOrganisation`, `updateBranch` (bank account), `createDepartment`, `assignMissingEmployeeIds`, `recordPayment`, `stopBroadcast`. | **All refused**, and SQL shows nothing changed: tech roles, tech role permissions, admin active flag, user count, organisation name, branch bank details, payments, departments, broadcast, first-organisation employee ids. The other admin's `assignMissingEmployeeIds` succeeds **for their own organisation only** (fenced; first-organisation ids unchanged), which is correct. |
| **API** (NestJS on :4000) | All 18 controller routes return 401 without a session. A forged Bearer token returns 401. `/health` returns 200. |
| **AC-MW / AC-RATE / AC-REDIR** | See SEC-03 and SEC-02. |

### DAST: OWASP ZAP baseline (`ghcr.io/zaproxy/zaproxy:stable`, passive, CI)

| Target | URLs crawled | High | Medium | Low | Info |
|---|---|---|---|---|---|
| Portal, signed out (`:3001`) | 29 | 0 | 3 | 2 | 4 |
| Portal, signed in as Administrator (session cookie injected by ZAP's replacer; spider from `/dashboard`) | 535 | 0 | 4 | 2 | 6 |
| Website + customer portal, signed out (`:3000`) | 163 | 0 | 3 | 2 | 4 |

Triage:
- **10055 CSP** (Wildcard Directive, script-src and style-src unsafe-inline), on every target: true positive, SEC-04.
- **90004 COEP/CORP** missing: true positive, SEC-05 (Low).
- **10202 "Absence of Anti-CSRF Tokens"** on `/structure` forms: false positive. These forms post to Next server actions. Next rejects a server-action POST whose `Origin` does not match the host, and the session cookie is `SameSite=Lax`, so no token is needed.
- **10031 "User Controllable HTML Element Attribute"** (`/notifications?area=…`): false positive. The raw value is echoed only as the `value` of a hidden input (`notifications/page.tsx:52`), and React escapes attribute values. It is only filtered by comparing it with each item's area.
- **10024 "Sensitive Information in URL"** (`userId=` filter on `/audit-logs`): informational, an opaque id.
- **10019 / 10049 / 10109**: informational.

The API, signed out, was probed with curl instead of ZAP: every route returned 401 (§5).

## 6. Database exposure (Supabase roles): `apps/portal/e2e/security/rls-check.ts`

Before the schema is pushed, CI recreates a new Supabase project's starting point (`rls-supabase-roles.sql`): the `anon`, `authenticated` and `service_role` roles, `USAGE` on `public`, and **default privileges granting ALL on tables, sequences and functions** to the API roles. It then runs the exact deploy path (pre-deploy SQL → `db push` → post-deploy SQL → `db push`).

| Check | CI result |
|---|---|
| RLS-01 RLS enabled (`pg_class.relrowsecurity`) | 93/93 tables |
| RLS-02 policies opening a table to anon/authenticated | 0 (0 policies at all = default deny) |
| RLS-03 table privileges (7 privileges × 93 tables × 2 roles) | 0 |
| RLS-04 sequence privileges | 0 (no sequences; CUID keys) |
| RLS-05 default privileges for future tables/sequences | none for anon/authenticated |
| RLS-06 live `SET ROLE anon/authenticated`: SELECT / INSERT / UPDATE / DELETE on every table | **744/744 refused, "permission denied"** |
| RLS-07 functions in `public` executable by anon (RPC) | none |
| RLS-08 a table created after the deploy SQL | no grants for anon/authenticated (RLS off until the next post-deploy run) |

**Local run with negative control** (Postgres 16 on :54329; 93 tables created from the `@@map` names in `schema.prisma`, because Prisma engines cannot be downloaded here):
- *before* `scripts/postdeploy/0001-rls-default-deny.sql`: RLS-01, -03, -04, -05, -06 and -08 all **FAIL**. There were 1,302 table grants, anon could SELECT, UPDATE and DELETE every table, and 93 tables had RLS off;
- *after* it: 8/8 PASS.

This proves the test can detect the exposure and that the deploy SQL removes it.

## 7. Concurrency and load

### Concurrency (`concurrency.ts`, CI, real `next start` + Postgres; reasons from the server log)

| ID | Burst | Result |
|---|---|---|
| CONC-01 | `recordPayment` ×30, same idempotency key | **1 payment.** All 30 answered OK (idempotent replay). In earlier runs 1–2 got "just recorded". |
| CONC-02 | `recordPayment` ×20, different keys, Σ 181,330 vs 100,000 owed | **Paid 99,385 ≤ 100,000.** 11 accepted, 11 rows, status moved to IN_PROGRESS once. 9 refused "Up to ₦615.00 can still be recorded". |
| CONC-03 | `createJobCard` ×20, same vehicle | **1 open Job Card.** 19 refused "already has an open Job Card". |
| CONC-04 | `createJobCard` ×15, different vehicles | Unique numbers 6/6, **but only 6/15 created** (CONC-01 finding). |
| CONC-05 | `approveJobCard` ×20 | **1 approval, 1 audit row.** 19 refused "Someone else changed this just now". |
| CONC-06 | `recordRefund` ×20, same key | **1 refund.** |
| CONC-07 | `recordRefund` ×10, different keys, Σ 120,045 vs 50,000 paid | **Refunded 41,006 ≤ 50,000.** 3 accepted, 7 refused "only ₦8,994.00 remains". |
| CONC-08 | `recordGoodsReceipt` ×20, same key | **1 receipt, stock 0 → 4** (once). 19 refused (unique index; CONC-02 finding). |
| CONC-09 | `approvePartRequestSlipByStore`: 10 slips × 3 against 10 on hand | **Reserved 9 ≤ 10**, 3 approved, reserved = 3 × approved. |
| CONC-10 | the same slip approved ×10 | **Reserved +3** once. |
| CONC-11 | `releasePartRequestSlip` ×10 | **On hand −2 and reserved −2, once.** Slip RELEASED. |
| CONC-12 | whole-DB invariants | 0 negative stock, 0 reserved > on hand, 0 duplicate payment keys, 0 overpaid cards, 0 vehicles with 2+ open cards. |

Not covered by a burst test: cancellation and close **approvals** (the compare-and-set pattern is the same one CONC-05 proves), warranty issue, and number generation for documents other than Job Cards (same `max+1` pattern as CONC-04).

### Load (`ops/load-test/k6-ci.js`, k6 via `grafana/setup-k6-action`)

**Setup:** **one `next start` instance on a 2-vCPU GitHub runner, with Postgres on the same machine.**

**Mix:**
- pulse 50 %;
- heavy pages 30 % (`/dashboard`, `/workshop/job-cards`, `/inventory`, `/analytics`, `/users`), as Master Admin or Administrator;
- `globalSearch` 10 %;
- sign-in 5 %, from a fresh client address each time;
- list pages 5 %;
- think time 0.2–0.8 s;
- plus a write workflow at 1 per 6 s: create, stop and delete a broadcast.

**Proposed SLOs** (not yet agreed with the owner): pages p95 < 1.5 s, pulse p95 < 500 ms, errors < 1 %.

| Stage | VUs / time | req/s | Errors | Pulse p50 / p90 / p95 / p99 | Pages p50 / p90 / p95 / p99 | Search p95 | Sign-in p95 |
|---|---|---|---|---|---|---|---|
| smoke | 1 / 30 s | 1.9 | 0 % | 12 / 17 / 19 / 30 ms | 47 / 92 / 99 / 114 ms | 131 ms | 92 ms |
| baseline | 10 / 60 s | 18.4 | 0 % | 9 / 32 / 49 / 172 ms | 49 / 131 / 162 / 266 ms | 275 ms | 240 ms |
| ramp | 10→50 / 90 s | 42.5 | 0 % | 148 / 309 / 365 / 454 ms | 410 / 826 / 925 / 1,138 ms | **2,045 ms** | 751 ms |
| spike | 0→120→0 / 40 s | 42.7 | 0 % | 736 / 1,229 / **1,419** / 2,232 ms | 1,953 / 3,177 / **3,557** / 4,221 ms | **9,348 ms** | **2,047 ms** |
| soak | 25 / 120 s | 41.7 | 0 % | 23 / 78 / 104 / 181 ms | 93 / 258 / 361 / 543 ms | 562 ms | 415 ms |
| recovery | 10 / 45 s | 19.2 | 0 % | 6 / 15 / 26 / 43 ms | 30 / 80 / 99 / 144 ms | 110 ms | 139 ms |
| write (whole run) | 1 per 6 s | — | 0 % (165 ops) | — | write p50 90 / p95 **2,698** ms | — | — |

**What the stages show:**
- **Recovery:** after the spike, latency is back to (or below) the baseline. There is no lasting degradation, no errors, and no error lines in the server log under load.
- **Soak:** two minutes at 25 users holds steady.
- **Saturation:** at about 42 req/s throughput stops rising, and only latency grows.

**Failover** (`k6-failover.js`): two instances (`:3011`, `:3012`) sat behind `ops/load-test/lb.mjs`, a round-robin proxy that marks a failed upstream down for 5 s and retries a GET once. 20 users ran for 60 s, and instance A was killed with `kill -9` at about 21 s:

| Phase | req/s | Errors | p50 / p95 / p99 |
|---|---|---|---|
| before | 44.5 | 0 % | 97 / 478 / 711 ms |
| first 10 s after the kill | 44.7 | **0.45 %** (2 requests in flight on A timed out at 60 s) | 70 / 347 / 585 ms |
| after | 46.9 | 0 % | 64 / 234 / 310 ms |

Sessions live in Postgres, so the surviving instance served every signed-in user with no re-login. Caveats: the in-memory flood limits and caches are per instance (SEC-06). This proves stateless failover of the app, **not** Vercel's load balancing or autoscaling.

## 8. Error handling and logging review

**Current state:**
- Unexpected server errors become **one JSON line** with `ref` (= the digest shown to the user), route, method and a redacted stack (`instrumentation.ts`, `lib/errors.ts` `redact()`).
- Handled failures that are not business messages become a JSON line via `logError(where, err)`, and users see "quote reference ABC123".
- Users never see a stack trace. The portal has `(app)/error.tsx` (friendly text plus reference), `global-error.tsx` and `not-found.tsx`.
- The CI log scan found no secrets and no email addresses in `portal.log` during the test runs.

**Gaps** are LOG-01..05 in §2.

**Proposal (small):**
1. **Request id:** in `middleware.ts`, run `const id = request.headers.get('x-request-id') ?? crypto.randomUUID()`. Forward it with `NextResponse.next({ request: { headers } })` and set it on the response. Vercel already sends `x-vercel-id`, which can be reused.
2. **Logger:** `lib/log.ts` exporting `log.error(where, err, extra)` and `log.warn`. Each writes one JSON line `{level, at, where, requestId: headers().get('x-request-id'), message: redact(…), code, stack: redact(first 6 frames)}` and drops any key named like `email|password|token|secret|authorization`. Replace the 80 `console.error` calls with it (mechanical), and reuse it in the website and the API (Nest `Logger` → JSON).
3. **Health:** `GET /api/health` on the portal and website returns `{status:'ok'}` (liveness, no DB). `GET /api/health/ready` runs `SELECT 1` with a 2 s timeout and returns 200 or 503 **without** the error text. Point uptime monitoring (Better Stack or UptimeRobot free tiers) at them.
4. **Sentry** (optional, free tier): run `npx @sentry/wizard -i nextjs` per app and set `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`. Keep `sendDefaultPii: false` and add a `beforeSend` that applies `redact()`. Not added here, because there is no DSN.

## 9. How to run

- **CI:** automatic on PRs to `main` and pushes to `work/testing`. Jobs: `secrets`, `sast`, `dependencies`, `dynamic` (about 17 min), `load` (about 12 min).
- **Locally:**
  - `RLS_DATABASE_URL=… npx tsx apps/portal/e2e/security/rls-check.ts` against any throw-away Postgres, after `rls-supabase-roles.sql`;
  - `gitleaks git . --config .gitleaks.toml --gitleaks-ignore-path .gitleaksignore --log-opts=--all`;
  - `semgrep scan --config .semgrep/ejo100.yml apps packages`;
  - `k6 run -e BASE=… ops/load-test/k6-ci.js`, only against a throw-away or staging copy, never production.

**Files:**
- `.github/workflows/security.yml`
- `.gitleaks.toml`, `.gitleaksignore`
- `.semgrep/ejo100.yml`
- `apps/portal/e2e/security/`: `lib.ts`, `action-map.mjs`, `fixtures.ts`, `access-control.ts`, `concurrency.ts`, `rls-check.ts`, `rls-supabase-roles.sql`, `bundle-scan.mjs`, `zap-report.mjs`
- `ops/load-test/`: `k6-ci.js`, `k6-failover.js`, `k6-report.mjs`, `lb.mjs`
