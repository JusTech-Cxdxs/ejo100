# EJO100 — End-to-end coverage (Playwright)

The E2E suite runs the business A to Z in a real browser, signed in as the person who really does each step,
against the production build of the portal (and the website / customer portal), a real PostgreSQL with the
real schema, and Mailpit catching every email. It is independent of the people who built the features: every
selector was read from the pages' TSX, and every expectation is the documented rule (the Authorization
Catalogue, the workflow rules in the actions), not "whatever the page does today".

_Status of this document: see "Latest CI run" at the bottom._

## How it runs

| Piece | Where |
|---|---|
| Workflow | `.github/workflows/e2e.yml` — on PRs to `main`, pushes to `work/e2e`, and manually (`workflow_dispatch`) |
| Services | Postgres 16, Mailpit (SMTP :1025, API :8025) |
| Apps | portal `next start` :3001; website (customer portal) `next start` :3002 — the website build/start is `continue-on-error`, its specs skip when it is down |
| Seed | `packages/database/prisma/seed.ts` → `scripts/v24-roles.sql` → `apps/portal/e2e/seed.ts` (run **twice** in CI to prove it is idempotent) |
| Config | `apps/portal/e2e/playwright.config.ts` — the job runs as **2 shards** (`--shard=n/2`, each with its own Postgres, Mailpit and apps), each with 2 workers (files in parallel, tests in a file in order; 3 workers measured slower on the runner); 1 retry in CI (a test that only passes on retry is annotated FLAKY, never hidden); 150 s per test; 38-minute global cap so results are always written |
| Results | `apps/portal/e2e/annotate.mjs` turns results into check-run annotations: `failure` = a failing test (or a known-defect test that unexpectedly passed), `warning` = flaky (passed on retry), `notice` = a known product defect still reproducing + totals. Server errors from the portal/website logs are annotated with the Prisma argument that caused them. Read with `gh api repos/{owner}/{repo}/check-runs/<job id>/annotations`. |

### Test data (seed + per-spec fixtures)

* **People** (`e2e/people.ts`): one account per role in the catalogue — administrator, branch administrator,
  front desk (receptionist), workshop supervisor, technician, workshop manager, finance officer, store manager,
  store officer, security officer, chief security officer, warranty HOD, warranty officer, department head,
  calendar user, scheduling admin, broadcaster — plus **Mike Supermanager** (Supervisor **and** Manager, for the
  segregation-of-duties checks), **Sola Switchable** (user-admin tests), **Rita Reset** (forgot-password) and a
  second organisation's administrator.
* **Customers**: Ada Customer (workshop), Kemi Portal and Lanre Otherportal (customer-portal passwords,
  `CustomerAccount` credential rows hashed with Better Auth's `hashPassword`), and Other Motors' customer.
* **Store**: category `E2ES`, three part types and three priced parts with stock **and** a goods-receipt layer
  under the stock (so FIFO release traceability is real): brake pads (Job Card lifecycle, carries a part
  warranty), oil filter (cancellation), spark plug (Vehicle Service). Each workflow spec owns its part, so stock
  assertions never collide.
* **Warranty**: provider `E2E Parts Warranty Co` and part policy `E2E-PART-12` (organisation-owned).
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
| `inventory.spec.ts` | Store manager creates category + part type + part (part number from the category code) → GRN with cost (stock 0 → 12, receipt traceable from the part, unit cost shown) → selling price → pricing, estimate matching, analytics (with ₦ figures), goods-receipt pages; a technician is refused when submitting the Add Part form |
| `warranty.spec.ts` | HOD adds a provider and a vehicle policy → officer registers a vehicle warranty with evidence → the registrar can't verify it; the HOD does → claim drafted (3C, amounts, odometer) → sent for approval → HOD → Branch Manager → recorded as submitted → provider decision → settlement; register search, claims, warranty analytics, seeded part policy |
| `security.spec.ts` | Visitor at the gate (ID, on foot, host) → received at reception → on-premises/register/desk boards → checked out; contractor team requested → Manager approves → signed in/out; delivery at the gate → Store confirms receipt → vehicle leaves; exit pass (technician) → Department Head → Manager → time out (people-out board) → time in; road test on a Job Card → Manager approves → out/in with odometer → Job Card trail; incident reported by an officer (can't close it) → CSO assigns and closes |
| `schedule.spec.ts` | Scheduling admin adds a room → calendar user books it with a colleague (emailed) → adds an outside visitor (Security sees the booking) → reschedules → cancels; calendar/rooms/availability/aides/appointments pages |
| `notifications.spec.ts` | Admin publishes a broadcast to everyone and one to Workshop Managers (emailed only to them) → technician's bell/centre shows only the first → manager sees both, marks one read (persists) → read counted → broadcast analytics |
| `search.spec.ts` | Header search finds a Job Card by number (and opens it), a customer by name, a vehicle by plate (opens it), a part by name; special characters / emoji / 300 chars never break it; another organisation's admin finds none of it |
| `role-matrix.spec.ts` | For **every seeded role** (and the Master Administrator): every menu page opens with no error boundary / Next overlay / HTTP ≥ 500, pages for everyone open, and 35 protected areas are open exactly when the Authorization Catalogue grants the permission and "Access denied" otherwise |
| `admin.spec.ts` | Give a role (the person's menu follows) and remove it; switch an account off → signed out on the next click, can't sign in → switch on → can sign in; admin pages; Audit Logs kinds/date/search filters; a Manager is refused the full trail |
| `robustness.spec.ts` | Double click → one record; Back/Refresh after saving → no duplicate; session expired while a form is open → sent to sign in, nothing saved; very long input saved or refused politely; accents/emoji/markup kept literally, never rendered as HTML, searchable |
| `mobile.spec.ts` | 375 × 812 smoke of key pages per role (no sideways scroll, no error) and the menu-drawer expectation |
| `customer-portal.spec.ts` | (website :3002) staff open a Job Card for the portal customer → the customer signs in and sees their own vehicle and that Job Card, never another customer's; wrong password refused; the other customer sees only theirs; the dashboard needs a session — **extend after merging the new portal** |
| existing | `auth.spec.ts` (sign-in, headers, reset), `roles.spec.ts`, `staff.spec.ts` (onboarding email), `structure.spec.ts`, `workshop.spec.ts` |

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
| Administration | — | — | — | R audit | — | — | — | — | — | ✓ (Sola) | ✓ | — | — |
| Role matrix (every page) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Customer portal | ✓ opens JC | — | — | — | — | — | — | — | — | — | — | — | ✓ |

### Not covered (and why)

* **Branch administrator's own workflows** beyond the role matrix (managing only their branch's people) — the
  seed has one branch per organisation; a second branch in the same organisation is needed to prove the
  branch fence. Next step: seed a second branch + people and add to `admin.spec.ts`.
* **Serialized / batch parts** (serial-number release, batch FIFO) — the seeded parts are quantity-tracked.
* **Warranty claim send-back, rejection, partial acceptance, replacement/repair remedies; provider/policy
  deletion approvals** — only the happy path is driven.
* **Vehicle inspection with findings** (start → review items → complete) — the spec skips the inspection.
* **Pricing alerts acted on** (dismiss / sync to target margin) — the page is opened, no alert is forced.
* **Contractor revoke, delivery cancel, visitor extend/cancel, exit-pass decline, road-test decline/extend.**
* **Customer portal beyond sign-in/dashboard** — being rebuilt on another branch (see `customer-portal.spec.ts`).
* **Cron routes** (reminders, digests) — not user workflows; covered by the existing unit tests.

## Defects found

See the table below (each one is asserted by a test marked `test.fail()` that cites its id, so CI stays green
while it reproduces and turns red the day it is fixed).

| Id | Severity | Where (cause) | Repro | Expected | Actual | Asserted by |
|---|---|---|---|---|---|---|
| **E2E-01** | Low (UX) | `apps/portal/app/(app)/inventory/parts/page.tsx:156-260` and `inventory/goods-receipts/new/page.tsx:57` render the forms for every `store.view` role | Sign in as a technician (or finance) → `/inventory/parts` | Read-only Store viewers see the catalogue without the "Add a Part" form; `/inventory/goods-receipts/new` offers no form | The full "Add a Part" and "Record Goods Receipt" forms are offered; submitting them is refused by the server (`requireStoreStaff`), so the person fills a whole form for an error | `inventory.spec.ts` › read-only Store viewers are not offered the Store's forms (the refusal itself is asserted in the test before it) |
| **E2E-02** | **High (confidentiality)** | `apps/portal/lib/actions/notifications.ts:314-336` — `listBroadcasts()` and `getBroadcast()` filter by organisation only; `app/(app)/notifications/broadcasts/page.tsx` and `broadcasts/[id]/page.tsx` have no guard | Admin publishes a broadcast to the *Workshop Manager* role → sign in as a technician → `/notifications/broadcasts?tab=all`, then open the broadcast's `/notifications/broadcasts/<id>` | A broadcast is visible only to its audience (as the bell and Notification Center already do, via `reaches()`); the management list/detail is for broadcasters | Every staff member can list every broadcast of the organisation and read any one (title, message, audience, read count) by URL | `notifications.spec.ts` › a broadcast meant for managers stays hidden from a technician everywhere |
| **E2E-03** | Medium (mobile) | `apps/portal/components/Sidebar.tsx:20` (`flex h-screen w-64` — no responsive classes) and `app/(app)/layout.tsx` (no menu button / drawer) | Open any portal page at 375 × 812 | Content uses the screen width; the menu is a drawer opened by a "Menu" button | The 256 px sidebar is always shown; the page content gets ~119 px (no sideways scroll only because the shell is `overflow-hidden`) | `mobile.spec.ts` › phone: the menu is a drawer… (the per-role phone smoke — render, no error, no sideways scroll — passes) |
| **E2E-04** | **High (audit integrity)** | `packages/database/src/audit-journal.ts:124-129` — `redact()` recognises Prisma `Decimal` by `constructor.name === 'Decimal'`; in the production build the name is minified, so the decimal.js instance is walked as a plain object and its own enumerable `constructor` (a function) is put into the JSON | Release a part request (part warranty issued), or approve an outside purchase, in the production build; see the server log | Every committed write has its data-change journal row (`db:*` in Audit Logs) | `Audit journal: failed to record Warranty create` / `ExternalProcurementRequest updateMany` / `failed to write committed entries` — `PrismaClientValidationError: Invalid value for argument constructor: We could not serialize [object Function]`. The entry — and, for transactions, the **whole batch** of that transaction's entries — is silently lost (stock, warranty, money writes). Fix: detect with `Prisma.Decimal.isDecimal(v)` / `typeof v.toFixed === 'function'`, and drop function values | `jobcard-lifecycle.spec.ts` › the data-change journal records the part warranty issued with the release (DB check) + the CI log annotation |
| **E2E-05** | Low (UX) | `apps/portal/app/(app)/warranty/[id]/page.tsx:268-281` renders "Evidence checked — verify" for every viewer of a pending warranty | Warranty Officer registers a vehicle warranty → stays on its page | The registrar (and anyone who may not verify) is told who verifies — no button | The button is offered; clicking it is refused by `verifyWarranty()` ("must be verified by someone other than the person who registered it") | `warranty.spec.ts` › the person who registered a warranty is not offered the Verify button (the refusal is asserted in the registration test) |
| **E2E-06** | Medium (audit usability) | `apps/portal/lib/actions/audit-logs.ts:44-56` — `kindWhere` (`entityType: { startsWith: 'db:' \| 'api:' }`) is spread into the `where` and then overwritten by the literal `entityType: { notIn: [...] }` key of the same object | Administrator → Audit Logs → "Data changes" (or "API requests") | Only data-change (or API) entries | Every kind of entry is listed (Business events, scheduled jobs…) — the two tabs filter nothing | `admin.spec.ts` › Audit Logs: the Data changes and API requests tabs show only their kind |
| **E2E-07** | Medium (workflow blocked every morning) | `apps/portal/lib/actions/warranty-claims-form-handlers.ts:44` stores the failure date as `` `${date}T12:00:00Z` `` (13:00 in Lagos); the readiness rule `apps/portal/lib/warranty-claim-readiness.ts:48` refuses a failure "in the future"; the form defaults the date to today (`app/(app)/warranty/claims/new/page.tsx:32`) | Before 13:00 Lagos time: Warranty → a verified warranty → Start a claim → keep today's date → fill the 3C and an amount → Save draft | The claim is ready ("Send for approval") | Readiness 88 %: "✕ Failure date is not in the future" — the claim cannot be sent until 1 pm; any claim for a failure that happened today is blocked all morning | `warranty.spec.ts` › a claim for a failure that happened today can be sent the same morning (expected to fail only before 12:00 UTC) |
| **E2E-08** | Low–medium (intermittent) | `apps/portal/lib/actions/notifications.ts:163-182` swallows the error and returns an empty summary; the error is Next's "used `headers` inside `after(...)`", most likely from `apps/portal/lib/auth.ts:114-117` (Better Auth `backgroundTasks` → `after(task)` with an already-running promise, so the session read that continues from it runs in the after() phase) | Seen in the CI server log while staff browse (`/roadmap`, `/security/visitors`) | The bell summary is computed | `Notification summary failed Error: Route /… used "headers" inside "after(...)"` — that poll returns an empty summary (the bell briefly says "all caught up") | CI log annotation only (not deterministic enough for a browser assertion) |


## CI timings

<!-- TIMINGS -->
