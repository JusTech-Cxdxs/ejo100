# EJO100 — End-to-end coverage (Playwright)

The E2E suite runs the business A to Z in a real browser, signed in as the person who really does each step,
against the production build of the portal (and the website / customer portal), a real PostgreSQL with the
real schema, and Mailpit catching every email. It is independent of the people who built the features: every
selector was read from the pages' TSX, and every expectation is the documented rule (the Authorization
Catalogue, the workflow rules in the actions), not "whatever the page does today".

_Status: see "Latest CI run" at the bottom. Adapted to the new portal shell (grouped sidebar, phone drawer, account menu, grouped bell, combobox search) and extended to the rebuilt customer portal and the CRM. E2E-01…07 are fixed (their tests now pass unmarked); E2E-08 is open; E2E-09…12 are new._

## How it runs

| Piece | Where |
|---|---|
| Workflow | `.github/workflows/e2e.yml` — on PRs to `main`, pushes to `work/e2e`, and manually (`workflow_dispatch`) |
| Services | Postgres 16, Mailpit (SMTP :1025, API :8025) |
| Apps | portal `next start` :3001; website (customer portal) `next start` :3002 — the website build/start is `continue-on-error` so its log is still collected, but in CI the customer-portal and CRM specs **fail** when it is down (it is part of the product) |
| Seed | `packages/database/prisma/seed.ts` → `scripts/v24-roles.sql` → `apps/portal/e2e/seed.ts` (run **twice** in CI to prove it is idempotent) |
| Config | `apps/portal/e2e/playwright.config.ts` — the job runs as **2 shards** (`--shard=n/2`, each with its own Postgres, Mailpit and apps), each with 2 workers (files in parallel, tests in a file in order; 3 workers measured slower on the runner); 1 retry in CI (a test that only passes on retry is annotated FLAKY, never hidden); 150 s per test; 38-minute global cap so results are always written |
| Results | `apps/portal/e2e/annotate.mjs` turns results into check-run annotations: `failure` = a failing test (or a known-defect test that unexpectedly passed), `warning` = flaky (passed on retry), `notice` = a known product defect still reproducing, an **intermittent** known defect recorded at run time (E2E-11, with its evidence), and the totals. Each failure names the line that failed (`@helpers.ts:16 ← spec.ts:153`), and URL / visibility waits say where the page ended up and what it showed (`urlOrExplain`, `visibleOrExplain`). Server errors from the portal/website logs are annotated with the Prisma argument that caused them. Read with `gh api repos/{owner}/{repo}/check-runs/<job id>/annotations`. |

### Test data (seed + per-spec fixtures)

* **People** (`e2e/people.ts`): one account per role in the catalogue — administrator, branch administrator,
  front desk (receptionist), workshop supervisor, technician, workshop manager, finance officer, store manager,
  store officer, security officer, chief security officer, warranty HOD, warranty officer, department head,
  calendar user, scheduling admin, broadcaster — plus **Mike Supermanager** (Supervisor **and** Manager, for the
  segregation-of-duties checks), **Sola Switchable** (user-admin tests), **Rita Reset** (forgot-password) and a
  second organisation's administrator.
* **Customers**: Ada Customer (workshop), and four portal customers with known passwords (`CustomerAccount`
  credential rows hashed with Better Auth's `hashPassword`, reset on every seed): Kemi Portal and Lanre
  Otherportal (portal and isolation), Tobi Passwordchange (forgot / change password — reset to the known password
  before each password test) and Funmi Switchoff (CRM portal access off/on); plus Other Motors' customer.
* **Store**: category `E2ES`, three part types and three priced parts with stock **and** a goods-receipt layer
  under the stock (so FIFO release traceability is real): brake pads (Job Card lifecycle, carries a part
  warranty), oil filter (cancellation), spark plug (Vehicle Service). Each workflow spec owns its part, so stock
  assertions never collide.
* **Warranty**: provider `E2E Parts Warranty Co`, part policy `E2E-PART-12` and vehicle policy `E2E-VEH-24`
  (organisation-owned; the customer-portal spec registers a vehicle warranty with it).
* **Fresh vehicles per spec** (`e2e/db.ts → freshVehicle`) with never-used plates, so specs never collide and a
  retry always starts clean. `e2e/db.ts` is used ONLY for such fixtures and for cheap downstream checks the UI
  doesn't show (e.g. "exactly one payment row after a double click"); every business step goes through the UI.

## Specs

| File | What it proves |
|---|---|
| `jobcard-lifecycle.spec.ts` | Full Job Card A–Z: open → supervisor approve + assign → technician accepts (bell) → estimate (Store part + outside part by the technician; labour + sundry priced by the supervisor; technician can't price labour; one sundry only) → Store matching (store officer) → submit → supervisor approval → **SoD**: the supervisor who is also a Manager is refused the final approval → another Manager approves (front desk emailed) → customer notified (Mailpit; once only; no internal line types) → 70% deposit with a **double click = ONE payment** (DB-checked), refresh doesn't re-record → In Progress → parts request: HOD → Store reserves (stock reserved +2 on the part page) → release (on hand −2, reserved back, part warranty issued) → outside purchase: Finance review → Manager → Finance disburses → QC (technician can't sign off) → Completed → Ready → balance (Cash) → close requested → Manager approves → checked out → Security lets it out of the gate → audit trail + Audit Logs + printable customer estimate |
| `jobcard-rejections.spec.ts` | One open Job Card per vehicle; supervisor rejects with a reason (creator emailed) → front desk reassigns supervisor; technician turns the assignment down (reason on the trail) → reassigned → accepted; Manager **returnEstimateForChanges** → supervisor edits the line and re-approves → Manager approves; a cancellation request is declined and can be asked again |
| `jobcard-cancellation.spec.ts` | Paid (70%) Job Card with stock **reserved** for it → front desk asks to cancel → Manager sees the refund it authorises → cancelled → the open parts request is withdrawn and the reserved stock is back (part page) → hand-back blocked until refunded → front desk can't refund → Finance records the refund (receipt emailed, `/workshop/refunds` lists it) → hand back → the vehicle can open a new Job Card |
| `vehicle-service.spec.ts` | Book → check in (**front desk only** — technician has no button) → approve/assign/accept → inspection skipped with a reason → normal service estimate (Store part + labour) → Store matching → approvals → customer emailed → 70% deposit moves it In Service → complete (notes) → ready → balance → close → collected; service tracker; a cancelled booking handed back; a service escalated to a Job Card (findings + trail carried over, service read-only) |
| `inventory.spec.ts` | Store manager creates category + part type + part (part number from the category code) → GRN with cost (stock 0 → 12, receipt traceable from the part, unit cost shown) → selling price → pricing, estimate matching, analytics (with ₦ figures), goods-receipt pages; read-only Store viewers (technician) are not offered the Store's forms (E2E-01, fixed) |
| `warranty.spec.ts` | HOD adds a provider and a vehicle policy → officer registers a vehicle warranty with evidence → the registrar can't verify it; the HOD does → claim drafted (3C, amounts, odometer) → sent for approval → HOD → Branch Manager → recorded as submitted → provider decision → settlement; register search, claims, warranty analytics, seeded part policy |
| `security.spec.ts` | Visitor at the gate (ID, on foot, host) → received at reception → on-premises/register/desk boards → checked out; contractor team requested → Manager approves → signed in/out; delivery at the gate → Store confirms receipt → vehicle leaves; exit pass (technician) → Department Head → Manager → time out (people-out board) → time in; road test on a Job Card → Manager approves → out/in with odometer → Job Card trail; incident reported by an officer (can't close it) → CSO assigns and closes |
| `schedule.spec.ts` | Scheduling admin adds a room → calendar user books it with a colleague (emailed) → adds an outside visitor (Security sees the booking) → reschedules → cancels; calendar/rooms/availability/aides/appointments pages |
| `notifications.spec.ts` | Admin publishes a broadcast to everyone and one to Workshop Managers (emailed only to them) → technician's bell/centre shows only the first → manager sees both, marks one read (persists) → read counted → broadcast analytics |
| `search.spec.ts` | Header search (the "Search everything" combobox and its results listbox) finds a Job Card by number (and opens it), a customer by name, a vehicle by plate (opens it), a part by name; special characters / emoji / 300 chars never break it; another organisation's admin finds none of it |
| `role-matrix.spec.ts` | For **every seeded role** (18 accounts incl. the Supervisor+Manager) and the Master Administrator: every menu page opens with no error boundary ("Something went wrong"), Next error overlay, "Application error" or HTTP ≥ 500 for the document; pages for everyone open; nothing in the menu is refused; every one of 35 protected addresses the Authorization Catalogue does **not** grant is refused when typed in (one shown in the browser as "Access denied", all checked over HTTP with the person's session) |
| `admin.spec.ts` | Give a role (the person's menu follows) and remove it; switch an account off → signed out on the next click, can't sign in → switch on → can sign in (audit entries for both); admin pages; Audit Logs kinds/date/search filters; each Audit Logs tab shows only its kind; an organisation administrator sees the data-change journal (E2E-09); a Manager is refused the full trail; **branch fences** (second branch of the same organisation) |
| `robustness.spec.ts` | Double click → one record; Back/Refresh after saving → no duplicate; session expired while a form is open → sent to sign in, nothing saved; very long input saved or refused politely; accents/emoji/markup kept literally, never rendered as HTML, searchable |
| `mobile.spec.ts` | 375 × 812 smoke of key pages per role (no sideways scroll, no error); the menu is a drawer: no menu column until "Open menu", "Close menu" and Esc close it, a menu link navigates and closes it; below 1024 px Sign out lives in the Account menu |
| `customer-portal.spec.ts` | (website :3002) a protected page asks for sign-in, a wrong password is refused, the right one returns to the page asked for; the overview greets by first name; vehicles are the customer's own; **forgot password** → Mailpit → "Set your password" → `?reset=done` → only the new password works → the same link again shows `reset-link-expired` (a link without a token too); unknown email reads the same; **change password** (E2E-12) and only the new one signs in afterwards; **a Job Card followed by its customer**: staff write and approve the estimate → the customer sees the visit (`service-card-<n>` → detail) but **no estimate until the front desk sends it** → sent: `customer-estimate` shows the line and total, the bell (`notification-bell`) lists it, "Mark all as read", the Notifications page (`notification-list`) has it read → Finance's deposit appears in `payment-history` → a vehicle warranty registered by the officer appears under Warranties and its page; **another customer**: the same Job Card / warranty addresses are "We couldn't find that", nothing of it in their lists; **profile**: save contact details, add and remove an address, announcement emails off/on (saved); **375 px**: "Open menu" drawer, a link navigates and closes it, "Close menu", Help & support (`ai-support-coming-soon`), no sideways scroll; **sessions never cross**: a staff session (even its token renamed as a customer cookie) never opens the customer portal, a customer session (and its token as a staff cookie) never opens the staff portal |
| `crm.spec.ts` | Hub → Ada's 360 page with her vehicles; edit details (audited) and add a note; register: primary phone and address required by the form **and** the server; register → welcome email (no password) → the customer sets a password on the website and signs in; "Send set-password link" → Mailpit → set → sign in; **portal access off** → the signed-in customer is out on the next click and cannot sign in → **on** → back in; a broadcast to **all customers** reaches the customer portal and never the staff (technician's broadcasts and bell); supervisor sees but cannot edit; technician refused; another organisation gets "Page not found" |
| existing | `auth.spec.ts` (sign-in, headers, reset), `roles.spec.ts`, `staff.spec.ts` (onboarding email), `structure.spec.ts`, `workshop.spec.ts`; `security/*` (the testing workstream's access-control, concurrency and RLS checks) |

## Workflow × role matrix

✓ = done in the browser as that role · R = only the refusal / visibility is asserted · — = the role has no part in it.

| Workflow | Front desk | Supervisor | Technician | Manager | Finance | Store mgr / officer | Security / CSO | Warranty HOD / officer | Dept head | Calendar / Sched admin | Broadcaster / Admin | Branch admin / Master | Customer |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Job Card lifecycle | ✓ open, notify, close req., hand back | ✓ approve, assign, price, approve est., QC | ✓ accept, draft, parts/EPR req., QC | ✓ final approve (SoD), HOD, close/cancel approve, check out | ✓ deposit, balance, review/disburse EPR, refund | ✓ match, reserve, release | ✓ gate exit | — | — | — | ✓ admin: audit | R role matrix | ✓ emails |
| Rejections / returns / cancellation | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — | ✓ refund email |
| Vehicle Service | ✓ book, check-in, notify, close req., hand back | ✓ | ✓ inspect/skip, draft | ✓ | ✓ | ✓ match | — | — | — | — | — | — | ✓ email |
| Parts requests | — | — | ✓ raise | ✓ HOD | — | ✓ reserve, release | — | — | — | — | — | — | — |
| Inventory (types, parts, GRN, pricing) | — | — | R | — | — | ✓ | — | — | — | — | — | — | — |
| Outside purchase (EPR) | — | — | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | — |
| Warranty | — | — | — | ✓ claim approval | — | (part warranty issued on release) | — | ✓ | — | — | — | — | — |
| Security & gate | ✓ contractor request | — | ✓ exit pass | ✓ approvals | — | ✓ delivery receipt | ✓ | — | ✓ authorise pass | — | — | — | — |
| Scheduling | — | — | — | ✓ invited | — | — | ✓ sees booking | — | — | ✓ | — | — | — |
| Notifications / broadcasts | — | — | ✓ sees / R | ✓ sees, marks read | — | — | — | — | — | — | ✓ publish | — | — |
| Global search | ✓ | — | — | — | — | ✓ | — | — | — | — | R other org | — | — |
| Administration | — | — | R other branch | R audit | — | — | — | — | — | ✓ (Sola) | ✓ | R branch fence | — |
| Role matrix (every page) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Customer portal | ✓ opens JC, notifies | ✓ writes, approves est. | ✓ accepts | ✓ approves est. | ✓ deposit | — | — | ✓ registers warranty | — | — | — | — | ✓ sign-in, passwords, services, estimate, bell, payments, warranties, profile, phone |
| CRM (customers) | ✓ register, edit, note, set-password link, access off/on | R view only | R refused | — | — | — | — | — | — | — | ✓ customer broadcast | R other org | ✓ sets password, signed out, sees broadcast |

### Not covered (and why)

* **Branch administrator changing people** (giving roles / switching off within their own branch) — only the
  fence is asserted (`admin.spec.ts` › branch fences: a second-branch technician is invisible to the branch
  administrator and cannot open the first branch's Job Cards).
* **Serialized / batch parts** (serial-number release, batch FIFO) — the seeded parts are quantity-tracked.
* **Warranty claim send-back, rejection, partial acceptance, replacement/repair remedies; provider/policy
  deletion approvals** — only the happy path is driven.
* **Vehicle inspection with findings** (start → review items → complete) — the spec skips the inspection.
* **Pricing alerts acted on** (dismiss / sync to target margin) — the page is opened, no alert is forced.
* **Contractor revoke, delivery cancel, visitor extend/cancel, exit-pass decline, road-test decline/extend.**
* **Customer portal: approving an estimate online, vehicle service (SV) detail, warranty claims seen by the
  customer, AI support (only its "coming soon" card exists)**; the CRM's contacts / addresses tabs and tags filters.
* **Cron routes** (reminders, digests) — not user workflows; covered by the existing unit tests.
* **The server refusing a Store write from a read-only role** — since E2E-01 was fixed the form is no longer offered,
  so the browser cannot submit it; the refusal (`requireStoreStaff`) would need an action-level test.

## Defects found

Each open defect is asserted by a test marked `test.fail()` that cites its id, so CI stays green while it
reproduces and turns red ("known defect … PASSED — remove test.fail") the day it is fixed. The tests assert the
correct behaviour, never the bug. Two are not deterministic enough for `test.fail` (it would itself be flaky):
E2E-08 is read from the server log, and E2E-11 is recorded at run time each time it happens (with the requests
around it) while the test carries on from the intended page.

**Status:** E2E-01…07 were fixed on `platform/customer-portal-crm` (commits `ce3f995`, `e7aaea3`); their tests now
pass with the `test.fail` marks removed — except that E2E-07 only reproduced before 12:00 UTC and every run on
the merged branch so far started after 12:00 UTC, so its fix still awaits a morning run. **Open:** E2E-08 (not seen
in today's runs), E2E-09, E2E-10, E2E-11, E2E-12.

Also seen in the server log (not counted as a defect — the browser still lands on sign-in): a page that loads while
its session is being ended (switched off, signed out) throws `Not authenticated.` from `requireUser`
(`apps/portal/lib/actions/workshop.ts:115`) and is logged as a render error, while the layout's redirect to
`/signed-out` wins in the browser.

| Id | Severity | Where (cause) | Repro | Expected | Actual | Asserted by |
|---|---|---|---|---|---|---|
| **E2E-01** (fixed) | Low (UX) | `apps/portal/app/(app)/inventory/parts/page.tsx:156-260` and `inventory/goods-receipts/new/page.tsx:57` render the forms for every `store.view` role | Sign in as a technician (or finance) → `/inventory/parts` | Read-only Store viewers see the catalogue without the "Add a Part" form; `/inventory/goods-receipts/new` offers no form | The full "Add a Part" and "Record Goods Receipt" forms are offered; submitting them is refused by the server (`requireStoreStaff`), so the person fills a whole form for an error | `inventory.spec.ts` › read-only Store viewers are not offered the Store's forms (the refusal itself is asserted in the test before it) |
| **E2E-02** (fixed) | **High (confidentiality)** | `apps/portal/lib/actions/notifications.ts:314-336` — `listBroadcasts()` and `getBroadcast()` filter by organisation only; `app/(app)/notifications/broadcasts/page.tsx` and `broadcasts/[id]/page.tsx` have no guard | Admin publishes a broadcast to the *Workshop Manager* role → sign in as a technician → `/notifications/broadcasts?tab=all`, then open the broadcast's `/notifications/broadcasts/<id>` | A broadcast is visible only to its audience (as the bell and Notification Center already do, via `reaches()`); the management list/detail is for broadcasters | Every staff member can list every broadcast of the organisation and read any one (title, message, audience, read count) by URL | `notifications.spec.ts` › a broadcast meant for managers stays hidden from a technician everywhere |
| **E2E-03** (fixed) | Medium (mobile) | `apps/portal/components/Sidebar.tsx:20` (`flex h-screen w-64` — no responsive classes) and `app/(app)/layout.tsx` (no menu button / drawer) | Open any portal page at 375 × 812 | Content uses the screen width; the menu is a drawer opened by a "Menu" button | The 256 px sidebar is always shown; the page content gets ~119 px (no sideways scroll only because the shell is `overflow-hidden`) | `mobile.spec.ts` › phone: the menu is a drawer… (the per-role phone smoke — render, no error, no sideways scroll — passes) |
| **E2E-04** (fixed) | **High (audit integrity)** | `packages/database/src/audit-journal.ts:124-129` — `redact()` recognises Prisma `Decimal` by `constructor.name === 'Decimal'`; in the production build the name is minified, so the decimal.js instance is walked as a plain object and its own enumerable `constructor` (a function) is put into the JSON | Release a part request (part warranty issued), or approve an outside purchase, in the production build; see the server log | Every committed write has its data-change journal row (`db:*` in Audit Logs) | `Audit journal: failed to record Warranty create` / `ExternalProcurementRequest updateMany` / `failed to write committed entries` — `PrismaClientValidationError: Invalid value for argument constructor: We could not serialize [object Function]`. The entry — and, for transactions, the **whole batch** of that transaction's entries — is silently lost (stock, warranty, money writes). Fix: detect with `Prisma.Decimal.isDecimal(v)` / `typeof v.toFixed === 'function'`, and drop function values | `jobcard-lifecycle.spec.ts` › the data-change journal records the part warranty issued with the release (DB check) + the CI log annotation |
| **E2E-05** (fixed) | Low (UX) | `apps/portal/app/(app)/warranty/[id]/page.tsx:268-281` renders "Evidence checked — verify" for every viewer of a pending warranty | Warranty Officer registers a vehicle warranty → stays on its page | The registrar (and anyone who may not verify) is told who verifies — no button | The button is offered; clicking it is refused by `verifyWarranty()` ("must be verified by someone other than the person who registered it") | `warranty.spec.ts` › the person who registered a warranty is not offered the Verify button (the refusal is asserted in the registration test) |
| **E2E-06** (fixed) | Medium (audit usability) | `apps/portal/lib/actions/audit-logs.ts:44-56` — `kindWhere` (`entityType: { startsWith: 'db:' \| 'api:' }`) is spread into the `where` and then overwritten by the literal `entityType: { notIn: [...] }` key of the same object | Administrator → Audit Logs → "Data changes" (or "API requests") | Only data-change (or API) entries | Every kind of entry is listed (Business events, scheduled jobs…) — the two tabs filter nothing | `admin.spec.ts` › Audit Logs: the Data changes and API requests tabs show only their kind |
| **E2E-07** (fixed) | Medium (workflow blocked every morning) | `apps/portal/lib/actions/warranty-claims-form-handlers.ts:44` stores the failure date as `` `${date}T12:00:00Z` `` (13:00 in Lagos); the readiness rule `apps/portal/lib/warranty-claim-readiness.ts:48` refuses a failure "in the future"; the form defaults the date to today (`app/(app)/warranty/claims/new/page.tsx:32`) | Before 13:00 Lagos time: Warranty → a verified warranty → Start a claim → keep today's date → fill the 3C and an amount → Save draft | The claim is ready ("Send for approval") | Readiness 88 %: "✕ Failure date is not in the future" — the claim cannot be sent until 1 pm; any claim for a failure that happened today is blocked all morning | `warranty.spec.ts` › a claim for a failure that happened today can be sent the same morning (expected to fail only before 12:00 UTC) |
| **E2E-08** | Low–medium (intermittent) | `apps/portal/lib/actions/notifications.ts:163-182` swallows the error and returns an empty summary; the error is Next's "used `headers` inside `after(...)`", most likely from `apps/portal/lib/auth.ts:114-117` (Better Auth `backgroundTasks` → `after(task)` with an already-running promise, so the session read that continues from it runs in the after() phase) | Seen in the CI server log while staff browse (`/roadmap`, `/security/visitors`) | The bell summary is computed | `Notification summary failed Error: Route /… used "headers" inside "after(...)"` — that poll returns an empty summary (the bell briefly says "all caught up") | CI log annotation only (not deterministic enough for a browser assertion) |
| **E2E-09** | **High (audit integrity)** | No data-change journal row is ever attributed. `apps/portal/lib/actions/workshop.ts:119` (`requireUser`) sets the actor with `setAuditActor` → `AsyncLocalStorage.enterWith` (`packages/database/src/audit-journal.ts:56-60`); in the production portal that store never reaches the Prisma middleware (`audit-journal.ts:214` `context.getStore()` is empty), so every `db:*` row has `userId` NULL and source `unknown` (or `unattributed` inside transactions); `stampOrganisation` (`:83-101`) then falls back to `soleOrganisation`, which is NULL once a second organisation exists. The same call pattern propagates in plain Node 20 (checked), so the store is lost inside the Next.js server runtime; the website's `markCustomerActor` (`apps/website/lib/customer-audit.ts:65`) uses the same mechanism | Any staff write (open a Job Card, record a payment…) with two organisations in the database; Administrator → Audit Logs → Data changes | The row says who changed what and belongs to the organisation, so its administrators see it | CI database after the run: e.g. 198 `db:*` rows, **all** `organisationId` NULL and `userId` NULL (`source=unknown` 96, `unattributed` 102); the organisation administrator's Data changes tab is empty; the Master Admin sees every change as "System". **Proposed fix:** resolve the actor when the journal writes, not with `enterWith` — add `setAuditActorResolver(fn)` to `audit-journal.ts` and use it in the middleware (and in `stampOrganisation`) when the store has no actor; register it once in the portal (e.g. top of `lib/actions/workshop.ts`) as `async () => { try { const s = await sessionForRequest(); return s ? { userId: s.user.id, source: 'portal', organisationId: s.user.organisationId ?? null } : null } catch { return null } }` (`sessionForRequest` is React-cached per request, so no extra query after `requireUser`; outside a request `headers()` throws → null), and the website likewise from `lookupCustomer`. Cron routes keep passing their source explicitly | `admin.spec.ts` › Audit Logs: an organisation administrator sees the data-change journal (prints the DB breakdown when it fails) |
| **E2E-10** | Medium (audit integrity) | `packages/database/src/audit-journal.ts:266` / `:293` take the journal row's `entityId` from the query result's `id` (or `where.id`); a create/update that `select`s without `id` gets NULL — e.g. `apps/portal/lib/actions/warranty.ts:564` and `:568` create part warranties with `select: { warrantyNumber: true }` | Release a part request with a part warranty (Job Card lifecycle) | The `db:Warranty` create row names the warranty it created | The row exists (asserted) but `entityId` is NULL, so the change cannot be traced to its record (Audit Logs shows "Record" with no link). **Proposed fix:** in the middleware, before `next(params)`, add `id: true` to `args.select` when a `select` without `id` is given (create / update / upsert / delete) | `jobcard-lifecycle.spec.ts` › each journal row names the record it changed (the issued warranty); the row's existence is asserted by the test before it |
| **E2E-11** | Medium (customers stuck; intermittent) | `apps/website/app/customer-portal/page.tsx:73-74` — after a successful sign-in, `router.replace(redirectTo); router.refresh();` | Customer signs in (seen in about 1 in 10–30 CI sign-ins) | The dashboard (or the page asked for) opens | The page stays on "Signed in — opening your dashboard… / Opening…" for good. Requests seen: two `200` RSC fetches of `/customer-portal/dashboard`, then the full-page load of `/customer-portal/dashboard` **aborted** (`net::ERR_ABORTED`) — most likely the soft navigation falls back to a full load which the queued `refresh()` then cancels (mechanism inferred from these requests; the website log shows no error). **Proposed fix:** after a sign-in that changes cookies, navigate once with `window.location.assign(redirectTo)` (or `router.replace` alone, without `refresh`). The staff login (`apps/portal/app/(auth)/login/page.tsx:72-73`) has the same two calls but did not show it in CI | Recorded at run time by `e2e/customer.ts › afterSignIn` (annotation "Intermittent known defects"); the test then opens the intended page itself |
| **E2E-12** | Medium (customers signed out) | `apps/website/lib/customer-portal/actions.ts:189-192` — `changePassword({ …, revokeOtherSessions: true })` revokes **every** session including the current one and issues a new cookie; the re-render of the same request still carries the old cookie, so `requireCustomer` (`lib/customer-portal/session.ts`) sends the customer to `/customer-portal/session-ended`, which signs out the new session too | Customer → Profile & settings → Change password | "Your password is changed. Other devices have been signed out." and the customer stays signed in | `/customer-portal?error=expired` — "Your session ended. Please sign in again." (the password **is** changed; asserted separately). **Proposed fix:** `changePassword({ …, revokeOtherSessions: false })` then `customerAuth.api.revokeOtherSessions({ headers })`, which keeps the current session | `customer-portal.spec.ts` › passwords › change password: the confirmation shows and the customer stays signed in |


## CI timings

Measured on the green run below (GitHub-hosted `ubuntu-latest`, two shards in parallel, each with its own
Postgres, Mailpit, portal and website):

| | Shard 1/2 | Shard 2/2 |
|---|---|---|
| Containers, install, schema, seed (×2), `next build` portal + website, Playwright install | ~5.8 min | ~5.8 min |
| **Real-browser tests** | **11.3 min** (71 tests) | **12.2 min** (66 tests) |
| Load test (shard 1 only) | ~1 min | — |
| **Job total** | **18.2 min** | **18.1 min** |

**Wall-clock for the whole suite: ~18.2 min** (target < 25 min). Test time per file (incl. any retries):
role matrix 566 s · Job Card lifecycle 282 s · customer portal 274 s · Vehicle Service 251 s · Security 192 s ·
Job Card cancellation 171 s · rejections 162 s · admin 146 s · CRM 141 s · Warranty 108 s · schedule 61 s ·
robustness 54 s · inventory 47 s · mobile 46 s · notifications 42 s · search 41 s · existing specs ~190 s.
The customer-portal and CRM specs added ~7 min of test time; the wall-clock grew ~2.6 min because they run on
shard 1 beside the Job Card specs.

How the time came down while the suite grew: one worker → 2 workers (3 measured slower: CPU-bound runner);
forbidden addresses in the role matrix checked over HTTP with the person's session (one of them in the browser);
each page opened once per role; two shards with their own database. Each annotation run also prints the
per-file times (`e2e time per file`), so a slow spec is visible immediately.

Load test on the same run (shard 1): sign-in p50 338 ms / p95 404 ms; pages (10 concurrent) p50 569 ms /
p95 1669 ms; live pulse (50 concurrent) p50 289 ms / p95 383 ms; 0 errors.

## Latest CI run

* Draft PR **#12** "[CI only — do not merge] e2e adaptation" (`work/e2e` → `platform/customer-portal-crm`).
* Workflow **E2E**, run **38265594872** @ `e89356b` — both shards **success**: shard 1/2 69 as expected (3 of them
  known defects: E2E-09, E2E-10, E2E-12) · 0 unexpected · 1 flaky · 0 skipped; shard 2/2 66 as expected · 0
  unexpected · 0 flaky. E2E-11 was recorded twice. The flaky one (CRM switch-off: the page briefly held two copies of
  the access controls) is fixed in the next commit by scoping them to the page's `#main`.
* Previous green run: 38263113864 @ `0baf78e` (0 flaky, E2E-11 recorded 4 times).
* Before it, on the merged branch: 38251673571 (shell adaptation: 4 failing), 38254109730 (7), 38257626020 (1),
  38260101304 (1) — each failure diagnosed from its annotation and fixed (test) or marked (product defect).
* Read any run's results: `gh api repos/JusTech-Cxdxs/ejo100/actions/runs/<run>/jobs --jq '.jobs[].id'`, then
  `gh api repos/JusTech-Cxdxs/ejo100/check-runs/<job id>/annotations`.

## Extending

* A new workflow spec: use `as(page, role)` to switch people, `open()` before acting on a page,
  `waitOutcome(page, /status=…/)` after a server action (it fails with the server's own `?error=` message or,
  when nothing happened, with the invalid fields and page text), `freshVehicle()` for a vehicle of its own, and
  the step helpers in `workflows.ts` (Job Card estimate/approval/payment chain, Store matching, pickers).
* A product defect: keep the test asserting the right behaviour, add `test.fail(true, 'E2E-NN: file:line — …')`,
  add a row above. When the defect is fixed the test "unexpectedly passes" and CI says so — remove the mark.
* Customer portal: `e2e/customer.ts` has the customer side — `portal()`, `submitSignIn`, `customerSignedIn`,
  `afterSignIn` (records E2E-11 and carries on), `customerSignOut`. The website runs on :3002 with
  `NEXT_PUBLIC_WEBSITE_URL=http://localhost:3002` and SMTP to Mailpit; reset/welcome links point at it.
* Shell selectors (portal): the signed-in shell is up when the **Account menu** button is visible
  (`expectSignedIn`); module links are `menuLinks(page)` (the grouped sidebar, not the roadmap); the bell is read
  with `bellText(page)`; below 1024 px the menu is the "Open menu" drawer and Sign out is in the Account menu
  (`signOut` handles both).
