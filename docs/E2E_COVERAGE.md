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
| Config | `apps/portal/e2e/playwright.config.ts` — 2 workers (files in parallel, tests in a file in order), 1 retry in CI, 38-minute global cap so results are always written |
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

<!-- DEFECTS -->

## CI timings

<!-- TIMINGS -->
