# EJO 100 — Production Readiness Record (Phase A close-out)

The standard: defence in depth, graceful failure, bounded resource use, monitoring, tested recovery,
least privilege, and a clear path to scale. No system can promise "nothing can ever break"; this
records what is verified, what was fixed, what is deliberately deferred, and what risk remains.

## 1. Verified and in place
| Area | State |
|---|---|
| Server actions | Every exported action reaches a sign-in / permission check (scan: 0 gaps); internal helpers are not server actions (`lib/workshop-core.ts`, `lib/service-reminders-core.ts`) |
| API (NestJS) | Session guard global (secure by default, `@Public()` only for health); security headers; per-address rate limit (300/min, auth 20/min) |
| Database public API | **v20**: RLS on every table automatically; public roles have no table / sequence / function access; future tables locked by default |
| Secrets | None in the repository; only Supabase URL + anon key are public (by design, used only for the change ping) |
| Injection / XSS | Prisma parameterised queries only; React escaping; names escaped in emails |
| Login | Rate-limited (5 / min); "redirect back" only to pages on this site (open redirect closed) |
| Submissions | Per-address flood limit on form posts / actions (120 / min / instance) → friendly 429 |
| Double processing | PRS HOD / Store / Release and EPR Finance / Manager / Disburse use compare-and-set (second request refused, stock release rolled back); payments and refunds refuse an identical repeat within 20 s |
| Errors | Users see plain words or "quote reference ABC123" — never technical text (116 handlers); error / not-found pages |
| Logs | Structured JSON error lines with reference, route, time; secrets redacted; `instrumentation.ts` catches every server error |
| Scheduled jobs | Reach their `CRON_SECRET` check (they were being redirected to the login page) |
| Notifications | Every workflow step → action item (until done) + activity + email + audit trail; live updates with push + fallback |
| Performance | Request / cross-request caching, parallel loading, indexes, cursor paging, search as you type |
| CI | Install → database build → lint → typecheck → build → dependency vulnerability report |
| Production build | Full `next build` passes (96 pages); every data page is dynamic (no frozen data) |
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

## 3. Recovery runbook
- **Code**: Vercel → Deployments → previous → Instant Rollback (seconds). Render → Deploys → Rollback.
- **Database**: every schema change ships as additive, re-runnable SQL — no destructive migrations.
- **Backups**: the Supabase free plan has limited backup coverage. Before go-live: upgrade to a plan
  with daily backups + point-in-time recovery, and do one **real restore test** into a new project.
  Do NOT store database dumps as GitHub artifacts while the repository is public.
- **Targets to agree with the business**: RPO (data you can afford to lose) and RTO (time to recover).

## 4. Remaining risks (owned, not hidden)
1. **The GitHub repository is public.** No secrets are in it, but the full source is visible. Make it
   private before go-live.
2. **Rate limits are per instance** (portal and API); a distributed attack needs the edge WAF above.
3. **Regions are split** (Vercel US, Render US, Supabase EU) — latency, not correctness; align on paid plans.
4. **Free-tier services** (Render sleeps; Supabase limits) — upgrade before real production load.
5. **Authorization (Phase B, in progress):** the catalogue, decision engine, page guards (16 areas), branch
   scope on Job Cards / Vehicle Services and the Permissions matrix are live. Remaining: migrate each
   workflow action's own role checks to `authorize()`, apply scope to lists / search / exports /
   notifications / realtime, and the role editor (database grants).
6. **No load test against staging yet** — run one (e.g. k6) against a staging copy before go-live.
7. **No staging environment yet** — create a Vercel Preview + a second Supabase project for staging.

## 5. Next phase
**Phase B — Authorization Catalogue**: User → Role → Permission → Scope (branch / department /
own / assigned) → Record → State → Action, enforced the same way on pages, actions, API, search,
exports, documents, notifications, realtime and analytics — with allowed AND denied tests.

## 6. Phase B — Authorization (status)
| Piece | State |
|---|---|
| Catalogue (`lib/authz/catalogue.ts`) | 35 permissions (count derived from the catalogue and locked by a test), 16 roles, 5 scopes; pure `decide()` |
| Enforcement (`lib/authz/server.ts`) | `guardPage` (pages), `authorize` (actions), `canSeeRecord` (records); every refusal audited |
| Pages | 16 protected areas refuse on the server (pasted links included) → Access denied |
| Records | Job Cards / Vehicle Services outside scope behave as "not found" |
| Permissions page | Live matrix generated from the same code |
| Tests | 19 allowed / denied cases on the real code |
| Next | Workflow actions → `authorize()`; scope on lists, search, exports, notifications, realtime; role editor |
