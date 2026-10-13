# EJO 100 — Production Readiness Record (Phase A close-out)

The standard: defence in depth, graceful failure, bounded resource use, monitoring, tested recovery,
least privilege, and a clear path to scale. No system can promise "nothing can ever break"; this
records what is verified, what was fixed, what is deliberately deferred, and what risk remains.

> The binding rules every change must keep are in **[ARCHITECTURE_BASELINE.md](ARCHITECTURE_BASELINE.md)**; every table's owner, sensitivity, lifecycle, retention and AI access is declared in `apps/portal/lib/governance/data-inventory.ts` (enforced in CI).

## 1. Verified and in place
| Area | State |
|---|---|
| Server actions | Every exported action reaches a sign-in / permission check (scan: 0 gaps); internal helpers are not server actions (`lib/workshop-core.ts`, `lib/service-reminders-core.ts`) |
| API (NestJS) | Session guard global (secure by default, `@Public()` only for health); security headers; per-address rate limit (300/min, auth 20/min) |
| Database public API | **v20**: RLS on every table automatically; public roles have no table / sequence / function access; future tables locked by default |
| Secrets | None in the repository; only Supabase URL + anon key are public (by design, used only for the change ping) |
| Injection / XSS | Prisma parameterised queries only; React escaping; names escaped in emails |
| Login | Rate-limited per instance (staff and customers: 20 sign-ins a minute, 5 reset requests per 5 minutes by default); "redirect back" only to pages on this site (open redirect closed) |
| Submissions | Flood limit on form posts / actions per instance: 120 a minute per signed-in person, 1,500 per shared address, 120 per address when signed out → friendly 429 |
| Double processing | PRS HOD / Store / Release and EPR Finance / Manager / Disburse use compare-and-set (second request refused, stock release rolled back); payments and refunds refuse an identical repeat within 20 s |
| Errors | Users see plain words or "quote reference ABC123" — never technical text (116 handlers); error / not-found pages |
| Logs | Structured JSON error lines with reference, route, time; secrets redacted; `instrumentation.ts` catches every server error |
| Scheduled jobs | Reach their `CRON_SECRET` check (they were being redirected to the login page) |
| Notifications | Every workflow step → action item (until done) + activity + email + audit trail; live updates with push + fallback |
| Performance | Request / cross-request caching, parallel loading, indexes, cursor paging, search as you type |
| CI | Install → database build → lint → typecheck → build → dependency vulnerability report |
| Production build | Full `next build` of portal and website on every pull request; every data page is dynamic (no frozen data) |
| Durable idempotency | Payments and refunds carry a form operation id with a UNIQUE constraint (v21) — never recorded twice, even after a dropped connection |
| Large data | Ever-growing lists (GRNs, PRS, EPR, services by status) capped at the newest 500, search reaches older; analytics all-history reads documented with a pre-computation trigger |
| Runbooks | `docs/RUNBOOKS.md` — GitHub hardening, Supabase surface proof, staging, restore drill, load test, failure drills, infrastructure triggers |

## 2. Deliberately NOT added yet (and why)
| Item | Why not now | Add when |
|---|---|---|
| Redis | Single-region, modest traffic; Postgres + in-process caches suffice | Several app instances need a shared rate limit / cache / queue |
| Cloudflare WAF / DDoS | Vercel's edge absorbs basic floods | Public exposure grows or an attack is seen — put the domain behind Cloudflare (DNS proxy, WAF rules, bot fight) |
| Queues / workers | Emails and reminders are small and logged; cron covers schedules | Bulk work (mass emails, exports, imports) exceeds request time |
| Read replicas / partitioning | Data volume is small | Analytics queries slow live work, or tables pass tens of millions of rows |
| Kubernetes | Managed platforms already scale | Never, unless self-hosting is required |
| Service worker / offline mode | The staff portal and the customer portal are installable (see "Installable app" below) but have no service worker, so no page is kept on the phone. Pages carry personal and business data; caching them offline needs its own design (what may be stored, encryption, clearing on sign-out, stale approvals) | Offline use is a business need, with that design reviewed |

### Installable app
Both apps can be added to a phone's home screen and open full screen. The staff portal's
`apps/portal/app/manifest.ts` starts on `/dashboard`; the website's `apps/website/app/manifest.ts`
installs the customer portal (start `/customer-portal/dashboard`, scope `/customer-portal`). Names
come from `NEXT_PUBLIC_ORGANISATION_NAME`. Icons in each app's `public/icons/` were made from
`public/images/logo/logo.png` with sharp (192/512 px, maskable versions with a safe margin, a
180 px Apple touch icon); regenerate them the same way if the logo changes. The manifest
(`/manifest.webmanifest`) and the icons are plain GET files, open without a session, and fall
under the Content-Security-Policy's `default-src 'self'`.

## 3. Recovery runbook
- **Code**: Vercel → Deployments → previous → Instant Rollback (seconds). Render → Deploys → Rollback.
- **Database**: every schema change ships as additive, re-runnable SQL — no destructive migrations.
- **Backups**: the Supabase free plan has limited backup coverage. Before go-live: upgrade to a plan
  with daily backups + point-in-time recovery, and do one **real restore test** into a new project.
  Do not store database dumps as GitHub artifacts.
- **Targets to agree with the business**: RPO (data you can afford to lose) and RTO (time to recover).

## 4. Remaining risks (owned, not hidden)
1. ~~The GitHub repository is public.~~ **Done (6 Oct 2026):** the repository is private.
2. **Rate limits are per instance** (portal and API); a distributed attack needs the edge WAF above.
3. **Regions are split** (Vercel US, Render US, Supabase EU) — latency, not correctness; align on paid plans.
4. **Free-tier services** (Render sleeps; Supabase limits) — upgrade before real production load.
5. **Organisation isolation (done, v23):** every organisation sees only its own records, people,
   history and analytics (see §6). Known limits before a SECOND organisation is onboarded:
   customer e-mail, vehicle plate / chassis, warranty provider name and policy code are unique across
   the whole platform (a duplicate is refused with a plain message, never shared); the API's
   organisation-data routes are platform-team only until they are filtered per organisation; a new
   branch is recognised within 5 minutes (cache).
6. **No load test against staging yet** — run one (e.g. k6) against a staging copy before go-live.
7. **No staging environment yet** — create a Vercel Preview + a second Supabase project for staging.

## 5. Next phase
**Phase B — Authorization Catalogue**: User → Role → Permission → Scope (branch / department /
own / assigned) → Record → State → Action, enforced the same way on pages, actions, API, search,
exports, documents, notifications, realtime and analytics — with allowed AND denied tests.

## 6. Phase B — Authorization (status)
| Piece | State |
|---|---|
| Catalogue (`lib/authz/catalogue.ts`) | 49 permissions, 17 organisation roles, 5 scopes (12 Oct 2026); pure `decide()`; `homeBranch` for approvals and money (the person must belong to the branch) |
| Enforcement (`lib/authz/server.ts`) | `guardPage` (pages), `authorize` / `authorizeOn…` (actions), `allows` (buttons — same rule), `refuse` (workflow refusals), `canSeeRecord` / `seeOrNull` (records), `reachWhere` / `branchWithinReach` (lists); every refusal audited as `access.denied` |
| Actions | Every data-changing server action passes the catalogue or an audited workflow check — **locked by a CI test** (`tests/guard-coverage.test.ts`) |
| Module checks on the catalogue | Store, Finance, Manager approvals, Warranty, Security gate, Scheduling, Broadcasts, Audit, Analytics, Organisation / Branch editing — a grant added on the Roles page now really works |
| Pages | 18 protected areas (now incl. Inventory and Warranty Analytics) refuse on the server |
| Records | Job Cards, Vehicle Services, every Security record and its history: out of reach = "not found" |
| Lists / search / dashboards | Branch reach on Security lists, Store lists, master search (+ organisation / platform-team filters), dashboard tiles and trend, Security dashboard, notification feed |
| Analytics | Business (branch-aware: jobs, purchases, receipts, claims), Inventory and Warranty — catalogue-gated; money never sent to people without `analytics.business.view` |
| Exports / realtime | No CSV exports exist; print documents use the scoped getters. Realtime carries only "something changed" — the data is re-read through the same rules |
| Tests | 20 allowed / denied catalogue cases + guard coverage, run in CI on every push |
| Organisation fence | `decide()` refuses any record outside the person's organisation — no scope, not even ALL, crosses it; `reachWhere` = the organisation's branches; `orgWhere` / `orgOwned` on customers, vehicles, warranties, claims, providers, policies, staff, roles, search, analytics; every audit row stamped with its organisation (database layer) |
| Operating branch | Resolved per person: own Workshop branch → their organisation's → (platform team / jobs) the first |
| Deploys | Only production changes the database, and never with `--accept-data-loss` |
| Roles (realistic, v24) | Segregation of duties per department (Front Desk · Supervisor · Technician · Manager · Finance · Store · Warranty · Security · Scheduling); two administration levels — Organisation Administrator (headquarters, all branches) and Branch Administrator (one branch, cannot create administrators); everyone else may only request their own exit pass; menu, dashboard and search follow the same rules |
| Scheduled jobs (v25) | Vercel (daily): morning digest 7:00, pricing alerts 8:00; Supabase pg_cron (every 10 min): appointment reminders + scheduled broadcast emails; every run recorded and shown on Settings with email delivery health |
| Next | Recycle Bin (deletion flag, restore, platform purge after retention); per-organisation uniqueness (customer e-mail, plates, provider names) and per-organisation API routes — before a second organisation joins |

## 7. Permanent architectural principles (binding on every change)
1. **No subsystem on another's critical path without a compelling reason.** Prefer independent
   loading, caching, background reconciliation, targeted invalidation and graceful degradation.
   (Learned from notifications: adding them to the page request slowed every page.)
2. **Caches and realtime signals are accelerators, never authorities.** A cache may say "you have 3
   notifications"; only the server / database decides what they are and whether you may see them.
   A realtime ping means "something may have changed — reconcile", never "trust this data".
3. **Authorization decides who may ATTEMPT; the workflow decides whether it is valid NOW.** Layers:
   identity → central permission → scope (branch / department / assigned / own) → workflow state →
   transaction. Existing branch / workflow checks are never removed just because a central check exists.
4. **Every path, not just the page.** Pages, actions, API, search, lists, exports, notifications,
   realtime, documents and analytics drill-downs follow the same rule — and are tested, allowed AND denied.
5. **Critical invariants live in the database too** (e.g. the Master Administrator rule, unique
   operation ids, compare-and-set) — application code alone is not trusted to keep them forever.
