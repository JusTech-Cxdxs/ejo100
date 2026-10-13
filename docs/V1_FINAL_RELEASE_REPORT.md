# EJO100 V1 — Final Release Report

**Date:** 13 October 2026 · **Release candidate:** branch `platform/v1-final`, PR #19 → `main`
**Production today:** `main` at `0696ab0` (PR #11)

## Recommendation

**V1 can close once two things happen:**
1. CI passes on the release-candidate commit.
2. The owner completes the release prerequisites in section D.

I found no unresolved critical or high defect in the code. CI could not run on the candidate because GitHub Actions is blocked by a billing or spending-limit problem on the owner's account. The definition of done requires every check to pass on the exact candidate, so V1 is **not formally closed yet**.

This report does not claim the system is free of vulnerabilities or can scale without limit. It states what was checked and how.

---

## A. Verified fixes and changes in this release

### Security
| Item | Change | Evidence |
|---|---|---|
| SEC-01 (old Master Admin password in git history) | Split into three findings. **a)** Live account: resolved, because the owner changed the password twice and that replaces the only stored hash and signs out other sessions. **b)** Historical exposure: Low, accepted. **c)** `seed.ts` overwrites the password from `MASTER_ADMIN_PASSWORD` when run by hand: open (owner check, section D). The docs no longer show any hint of the old value. | Code review of `/change-password` → `accounts.password` and `revokeOtherSessions`. The API has no password login. No deploy runs the seed. `git log -S` over all refs found the value only in `.env.example` and in `seed.ts` before 19 Aug. |
| Session revocation | The portal session cookie cache is off, so a password change, deactivation or reset takes effect on the next request. A staff password reset now signs the person out everywhere. | `apps/portal/lib/auth.ts` |
| Single-use reset links | A new staff reset link withdraws earlier ones. Reset links expire after 1 hour (staff and customers); set-password links after 72 hours. | `lib/auth.ts`, `lib/staff-onboarding.ts`, website `auth-customer.ts`; unit tests in `tests/quality.test.ts`; E2E `link-expiry.spec.ts` (passed on the quality branch) |
| Password rules | 8 to 128 characters, set explicitly. | `lib/auth.ts` |
| Content-Security-Policy | Signed-in portal pages and the customer portal use a per-request nonce with `'strict-dynamic'`, so `'unsafe-inline'` scripts are gone there. The theme script is allowed by its hash. Static public pages keep the fixed policy. | `middleware.ts` in both apps. The independent auditor ran local production builds: every inline script carries the nonce, and it changes on each request. |
| API session cookie | The API now reads the production cookie name (`__Secure-` prefix) and the token part of the signed value. | `apps/api/src/common/guards/session-auth.guard.ts` |
| Request id | Every response carries `x-request-id`. | `middleware.ts`, `lib/request-id.ts` |
| Dependencies | Node 24 (Node 20 is end-of-life). NestJS 11 on Express 5, TypeScript 5.9, Better Auth 1.6.33, React 19.3. **`npm audit --omit=dev`: 0 vulnerabilities.** | Lockfile regenerated. Typechecks pass for all three apps; both Next builds and `nest build` pass. |
| Nothing hard-coded | 104 production URL fallbacks now go through `portalBaseUrl()` / `websiteBaseUrl()`. Organisation names, bank details, contact details and social links come from the database or `NEXT_PUBLIC_*` settings. The placeholder bank account is gone; customers only see their branch's real details. | `apps/portal/lib/portal-url.ts`, `apps/website/lib/site-config.ts`, `docs/OPERATIONS_CHECKLIST.md` §1 |

### Roles and access (`docs/ROLES_AND_ACCESS.md`)
Every change narrows access; nothing was widened.
- **Each role sees its own menu, dashboard, "My numbers" and action list.** A technician sees *My exit passes* under Security, not the gate registers.
- **New Approvals page (`/approvals`).** It lists only what is waiting for the viewer's decision, and the menu shows a live count.
- **Supplier costs and margins are hidden from the workshop floor.** This covers goods receipts, the Pricing Command Center and part costs, in both the pages and the server actions.
- **The workshop manager no longer runs the gate.** They keep pass, road-test and contractor approvals.
- **The Roles page describes each role in plain words,** with separate "can do" and "can approve" lists.

### Branch Assistant and assisted sessions (new)
**How it works**
- A Branch Assistant (IT or support) can help a colleague who is not comfortable with computers.
- The colleague types their own password on the assistant's screen. For a limited time (30 minutes by default) the assistant works on the colleague's tasks.
- Every action is recorded as "Colleague (assisted by Assistant)". The colleague is notified when the session ends.

**Safeguards**
- **Who can be assisted:** only people with no approval, money, administration, audit, analytics, cost or assignment rights, in the assistant's own organisation and branch.
- **Nothing is decided during a session:** every approve, decide, decline, release, verify and reject action refuses, the Approvals list is empty, and decision buttons are hidden. A unit test checks that every such action refuses. This fixes the independent auditor's P1.
- **Password attempts can't be raced:** attempts are counted and recorded under a lock (5 per colleague, 15 in all, per 15 minutes).
- **The session cookie is protected:** it is signed (HMAC), tied to the assistant's own sign-in, and checked again on every request.
- **The colleague's account is untouched:** their profile, password and notification settings are closed during a session.

### Error handling and references
**How a reference is handled**
- The reference a person sees ("quote reference 3553129217") is the same number that is logged and stored in `error_events`, with secrets and emails removed.
- IT looks it up under **Audit Logs → Error log** (`/audit-logs/errors`), filtered by organisation.
- Browser-side failures are reported through `/api/error-report`, which only accepts requests from the site itself and has its own budget.
- Stored references are deleted after 90 days.

**What else changed**
- Calm, branded error screens with gentle motion (off when reduced motion is requested), a copy button and an offline banner.
- Technical messages (Prisma, SQL, stack traces) can no longer reach users. A test covers 15 kinds of failure.
- Plurals: "1 job", "2 people", never "1 jobs".
- Times: midnight now reads "12:30 am" on Node 20. Reference numbers use the Lagos year. Pages and emails that had no time zone now show Lagos time. Histories are listed newest first.

### Emails
**Layout**
- Every template (84) uses one layout. The header is the logo plus the "Kewalram / Chanrai Group" wordmark with the green rule, as live text, so it still shows when images are blocked.
- Buttons also work in Outlook, and dark mode is supported.
- Each email has a plain-text version.
- Motion is subtle and only appears in Apple Mail and iOS Mail; Gmail and Outlook show the same design without it.

**Content**
- All wording is rewritten.
- Subject lines are specific, e.g. "Estimate ready for JC-… — Toyota Hilux (KJA-219-XY)".
- Security emails state when the link expires and what to do if the request wasn't yours.

**Fixes**
- A customer email linked to the staff portal.
- An email had the wrong subject.
- A due date was shown in UTC.

**Tooling and tests**
- Preview tool: `apps/portal/scripts/email-previews.ts`.
- Unit tests check escaping, links, the plain-text version, and that the two layout copies stay identical.

### Writing and code comments
- About 900 comment blocks were rewritten or removed, and about 200 long UI hints shortened.
- Machine-sounding phrasing and history narration were taken out, and emoji in professional text replaced with icons.
- Comments that guard security, data integrity, concurrency or tenancy were shortened, never removed.
- The auditor compared files with comments stripped: only string text changed, no logic.

### Roadmap and documentation
**Roadmap**
- It now has 28 modules, each with a "How it will work" section.
- Added: **Targets & performance**, **Messages** (official messages that are recorded and can be emailed, plus informal chat), Approvals designer, Quality & checklists, Technician app, Vehicle sales, Service plans, Customer feedback, Price lists & loyalty, Fleet accounts, Tax & e-invoicing (NRS/MBS) and Data warehouse.
- The AI phase is marked **Next**.

**Documentation**
- New: `README.md` (rewritten), `docs/AI_READINESS.md`, `docs/OPERATIONS_CHECKLIST.md` and `docs/ROLES_AND_ACCESS.md`.
- Updated: `docs/ARCHITECTURE_BASELINE.md`.

### Schema (v29, additive only)
- New tables: `assist_sessions` and `error_events`. Both are declared in the data inventory, and post-deploy SQL switches RLS on for them.
- New re-runnable post-deploy file `0003-branch-assistant-role.sql`, tested twice on Postgres.

---

## B. Test and deployment evidence

| Check | Result |
|---|---|
| Production = `main` | Vercel shows `0696ab0` deployed for the portal and website. Live `/api/health` on both returns `{"status":"ok","database":"connected"}` (12 Oct 2026, 21:50 UTC). That endpoint only exists from `0696ab0` on, which confirms production runs it. |
| Release candidate, local | Typechecks pass for portal, website and api. Portal unit tests: 144 pass, 0 fail (database tests are skipped locally). Portal and website `next build` and `nest build` pass. `npm audit --omit=dev` finds 0. Lockfile is consistent. |
| Release candidate, Vercel previews | Portal and website preview deployments succeeded on Node 24. |
| CI by workstream (before GitHub stopped running jobs) | **Roles (PR #14):** all jobs green, including E2E of 152 tests across 2 shards, the dynamic security scan and load. **Docs (PR #13):** all jobs green. **Quality (PR #17):** E2E shard 2 passed 71/71; shard 1 had one failure, a selector in the new spec, since fixed. Link-expiry, dynamic, load, SAST, secrets and dependencies passed. **Assist (PR #15):** E2E shard 1 passed 75/75, including `assisted-session.spec.ts`. One workshop test failed on shard 2 and one dynamic-scan item was flagged; both were fixed but not re-run. **Deps (PR #18) and Emails (PR #16):** CI was not run. |
| CI on the merged candidate | **Not run.** Every job was refused with "recent account payments have failed or your spending limit needs to be increased". |
| Independent audit of the merged candidate | Verdict: **NOT READY** because of one P1, two P2s and four P3s. Fixed since: the P1, both P2s, and the browser-error budget, notification-cache key and duplicate-session-lookup P3s. The remaining P3 (missing site addresses on non-Vercel production) is accepted, see E. Confirmed sound: assisted-session cookie and binding, organisation fencing, CSP nonce, email escaping, the comment rewrite (no logic change), Express 5 routes. |
| Last full green CI on production code | PR #11 (`c5fe835`): 135 E2E tests, the dynamic security scan (RLS 93/93 tables, IDOR, signed-out sweep, concurrency 12/12) and k6 load. |

---

## C. Unresolved critical or high risks
- **No known critical or high defect in the code.**
- **The release candidate has not run CI.** This is a process blocker, not a known defect. The parts most at risk are the nonce-based CSP (browser hydration) and the merged assisted-session and role flows.
- **High-priority follow-up:** Next.js 15 is in maintenance support, which by our reading of Vercel's policy ends around **21 October 2026**. Plan the Next 16 upgrade straight after V1.

## D. Owner-only actions

**Release prerequisites:**
1. **GitHub billing.** Settings → Billing and plans: fix the payment method or raise the Actions spending limit, then re-run CI on PR #19.
2. **SEC-01c.** Delete `MASTER_ADMIN_PASSWORD` from Render and Vercel, or set it to an unused random value. Then approve or decline the proposed create-only seed change.
3. **Environment variables.** See `docs/OPERATIONS_CHECKLIST.md` §1.
   - Set `NEXT_PUBLIC_ORGANISATION_NAME`, `NEXT_PUBLIC_PORTAL_URL` and `NEXT_PUBLIC_WEBSITE_URL` on both Vercel projects.
   - Set `NEXT_PUBLIC_PORTAL_URL` on Render.
   - Set the `SMTP_*` variables on the website project.
   - A production build stops with a clear message if a required one is missing, and the previous deployment stays live.
4. **Node 24.** Confirm Node 24 in the first Render and Vercel deploy logs.
5. **Backups.** Turn on Supabase backups (daily on Pro, point-in-time recovery as an add-on) and **do one restore test** into a scratch project. Recovery is unverified until this is done.
6. **Vercel plan.** Hobby is for non-commercial use, and Spend Management needs Pro. Then set a spend limit and Firewall rate-limit rules for `/login`, `/api/auth/*` and `/customer-portal`.

**Recommended:**
7. GitHub branch protection, with required checks `build`, `e2e (shard 1/2)`, `e2e (shard 2/2)`, `secrets`, `sast`, `dependencies`, `dynamic`. Also secret scanning, push protection and Dependabot alerts.
8. Branch bank details for "how to pay".
9. A custom domain with HSTS.

## E. Lower-priority follow-ups (owner: engineering)

| Priority | Item |
|---|---|
| P2 | Upgrades: Next 16 (soon, see C), then Prisma 6 or 7, NestJS 12 and ESLint 9. |
| P2 | Rate limits are per instance. Add Vercel WAF rules (D6) for a global limit. |
| P3 | Narrow the front desk's Security view to visitors (needs a reception-only permission). Make department heads' contractor list branch-scoped. |
| P3 | On non-Vercel production, missing site addresses only log an error; a hard failure is possible. Website translations still carry the older marketing lines. |
| P3 | The goods-receipt email goes out once per line. The customer portal shows 24-hour times while the staff portal uses 12-hour. |
| P3 | Remove the unused `generateSecurePassword`. Close the "Coming next" sidebar section by default now that it has 28 entries. |
| P3 | Track customer broadcast email delivery per customer. Give realtime notifications per-organisation private channels. |

## AI phase readiness
`docs/AI_READINESS.md` sets the boundary for the next phase:
- **Data access:** a separate Python service, reading curated views, with retrieval scoped to the asking person's own permissions and organisation fence.
- **Off limits:** 13 tables AI may never read, including auth and secrets.
- **Human in charge:** AI suggestions are recorded as "suggested by AI, done by X", and AI never acts on its own.
- **Privacy:** NDPA 2023 and GAID 2025 requirements.
- **Gaps to close first:** add a "redacted" access level and the curated views.
