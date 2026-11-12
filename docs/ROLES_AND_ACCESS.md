# Roles and access — what each person sees

This is the role walkthrough for EJO100 V1: for every role seeded in the test
database (`apps/portal/e2e/people.ts`), what that job does in a dealership
workshop, what the portal shows them, what they approve, and what they never
see. The rules live in code — `apps/portal/lib/authz/catalogue.ts` (permissions
and default grants), `lib/authz/navigation.ts` (the menu) and each page's
server-side guard — and the Roles page shows the same descriptions to
administrators.

Three things hold for everyone:

- **Pasted links do not get round the menu.** Every page checks the permission
  on the server and sends people without it to *Access denied*; every server
  action checks again. `e2e/role-matrix.spec.ts` opens every protected address
  as every role and fails if a forbidden page opens.
- **Everyone can request their own exit pass** and follow it under
  *My exit passes* (or *Exit passes* for the Security desk), and sees the
  visitors who came to see them under *My visitors*. That is the only thing
  every employee is granted by default (see *Security for people who are not
  on the desk* below).
- **Notifications are personal.** The bell and the dashboard's *Needs your
  attention* list only steps waiting on that person. The activity feed shows
  the records they are part of (jobs they work on, supervise or opened, their
  own requests and passes); heads of a department (Workshop Manager, Store
  Manager, Warranty HOD, Chief Security Officer, Scheduling Admin) also see
  their whole area, and the Organisation Administrator sees everything — all
  limited to their own organisation, and to their branch for branch-scoped
  people.

## Branches have a kind, and the plant is its own branch

Every branch is one kind of place (`apps/portal/lib/branch-types.ts`):
**Workshop** (job cards, vehicle services and the parts store), **Assembly
plant** (kits, the line, quality, PDI, the yard), **Vehicle sales**, **Head
office** or **Warehouse**. Kewalram's set-up is a workshop (*Isolo Branch*)
beside the plant (*Afprint Assembly Plant*, SAP plant 1100), both in Isolo. A
company with a workshop inside its plant opens two branches.

What this means for access:

- **Plant pages only ever show assembly-plant branches.** A branch-scoped
  person (PDI Inspector, Kit Inspector, Quality Supervisor, Plant Manager)
  sees their own plant. An organisation-wide person sees every plant, or the
  one their branch lens points at. A person with plant rights but no plant
  branch in reach (a branch administrator of the workshop, say) sees an
  explanation, never another branch's records; an administrator looking at
  the workshop through the lens is told the plant is elsewhere and switches
  with one tap.
- **Workshop work anchors only on workshop branches.** A department named
  "Workshop" on an assembly plant never takes job cards; parts, opening stock
  and invoice history load only into a branch that keeps a store (workshop or
  warehouse).
- **Registering a vehicle or recording a shipment** needs an assembly plant in
  reach; with one plant in reach, it is chosen for you (a tablet in the plant
  never asks).
- **A branch holding records of its kind keeps that kind.** The kind can be
  changed under Branches only while no job cards (for a workshop) or kits,
  vehicles and PDIs (for a plant) live there; otherwise open the new place as
  its own branch. The deploy opens the plant branch for an organisation that
  has plant records but no plant yet, and moves those records and the
  plant-only staff onto it (postdeploy 0011, audited). Anything that lands on
  a workshop later is moved from the Branches page, all together and audited.
- **The plant's departments** are created with the branch: Kit receiving &
  plant store, Production (the line), Quality (QC and QA audit), PDI, Yard &
  dispatch, Plant maintenance. Plant roles are the existing ones — Plant
  Manager, PDI Supervisor, PDI Inspector, Quality Supervisor, Kit Inspector —
  scoped to the plant branch — joined by the line roles below; yard roles
  arrive with the yard (D4).

### The line (D3)

Four permissions and four roles, all scoped to the plant branch:

| Permission | What it allows | Roles |
| --- | --- | --- |
| `plant.line.operate` | Start a build, record checks, finish a station, raise and rework defects | Line Operator, Production Supervisor, Quality Supervisor, Plant Manager |
| `plant.quality.gate` | Verify or reopen a reworked defect; pass the final gate | QC Inspector, Quality Supervisor, Plant Manager |
| `plant.qa.audit` | Start, score and finish a QA audit | QA Auditor, Quality Supervisor, Plant Manager |
| `plant.route.manage` | Save a new version of a route | Production Supervisor, Plant Manager |

Separation of duties the code enforces, whatever the role: a defect is never
verified by the person who reworked it; the gate is never passed by the
person who recorded its checks; a vehicle never passes the gate with an open
A- or B-defect or an unfinished station; a failed QA audit reverses the gate.
Reworked defects and recorded gates appear under **Approvals → Plant** for
the people who can act on them. All of these are refused while Enyo is
assisting (`refuseDuringAssist`).

### Job card history (P4)

Importing past job cards needs the Data Exchange permissions like every
import; approval is a **Workshop manager or an administrator**
(`workshop.close.approve`). The branch chosen is a **workshop** (never the
assembly plant). The technician's name on a past job card is seen by staff
on the vehicle's workshop page only — never on the customer's page or in the
customer portal. A past job card can be marked *attended to* or its vehicle's
tracking stopped by the people who may manage customers in the workshop
(`workshop.customer.manage`), checked against the vehicle's branch.

### Open job cards at the cut-over (P5)

Approval is a **Workshop manager or an administrator**; **Finance** then
confirms the opening payments (the same sign-off as opening stock and
invoice history). The loader writes the job cards directly in the chosen
workshop branch (never the assembly plant) with the approving person as the
record's creator; it sends no email or notification. Technician and
supervisor are matched to active staff of the organisation by employee ID or
name and otherwise left unset. Undo may bin a job card with a payment only
when the payment came in with the import and nothing has been recorded on
the job card since — the desk's own delete still refuses any job card with a
payment.

### Staff from SAP HR (P7)

The file is run by the IT Administrator (`dataexchange.import.run`) and
approved by an **Organisation Administrator** (`dataexchange.import.approve`
with `admin.users.manage` for the **whole organisation** — a Branch
Administrator, who manages one branch's people, can neither approve, undo
nor send the invitations of a file that reaches every branch; the server
refuses and the button is not shown). **No administrator role is ever given
by a file** — by name or by slug — nor any platform role. The accounts come
in switched off with an unusable password; nothing is emailed at load.
**Send the invitations** (an administrator of the whole organisation:
Organisation or IT Administrator) switches each waiting account on and sends
the welcome with a one-time set-password link — no password is ever sent or
seen; each person once, compare-and-set, audited `user.invited`. An address
with an account in another organisation is refused (never taken over).
Undo bins only accounts never invited or used; the bin never holds a
password, a session or a link (governance inventory: `recycleBin:
'IMPORT_UNDO'`).

### Open services and bookings at the cut-over (P6b)

Approval is a **Workshop manager or an administrator**, as for the open job
cards. The loader writes the services directly in the chosen workshop
branch (never the assembly plant), with the approving person as the
record's creator, and sends no email or notification. Staff are matched to
active colleagues of the organisation by employee ID or name, and otherwise
left unset. Checking a booking in is the front desk's own step
(`workshop.job_card.create` for that branch), exactly as for any booking.
Undo bins a service only when nothing has been recorded on it since the
import — no audited step, no payment, parts request, inspection or estimate.

### Warranties and open claims at the cut-over (P6)

Approval is **the Warranty HOD or a Branch Manager** (`warranty.claim.approve`
on top of `dataexchange.import.approve`, which the Warranty HOD now holds for
exactly this: no other import needs a right the HOD has). Both imports are
organisation-wide and read only the organisation's own customers, vehicles,
parts, policies and warranties. The person who ran the import is recorded as
each warranty's registration and the approver as its verification — the
desk's two-person rule, kept — so the two can never be the same person (the
platform administrator excepted, and recorded). Claims are created by the
person who ran the import, so they cannot approve them afterwards; the steps
taken before EJO name nobody in EJO. Nothing is emailed or notified. Undo
(the same two rights) bins only what nobody has used since; it is the only
way a warranty or a claim reaches the Recycle bin (governance inventory:
`recycleBin: 'IMPORT_UNDO'`), and restoring needs the Recycle bin right as
for anything else.

### The plant's records at the cut-over (P8)

Approval is **the Plant Manager or an administrator** (`plant.kit.release`
on top of `dataexchange.import.approve`, which the Plant Manager now holds
for exactly this, scoped to the plant branch: no other import needs a right
the Plant Manager has). The four imports — shipments, plant vehicles, kits,
kit issues — load only into an **assembly plant** branch, and read only that
plant's shipments and kits and the organisation's own plant vehicles and
people. Checks done before EJO name nobody in EJO (no inspector is recorded
as having answered them, and no one as passing the gate), so the desk's
separation of duties starts clean from the first decision taken in EJO.
Nothing is emailed or notified. Undo (the same two rights) bins only what
nobody has used since and nothing hangs on; it is the only way a plant
record reaches the Recycle bin (governance inventory: `recycleBin:
'IMPORT_UNDO'`), and restoring needs the Recycle bin right as for anything
else.

### Postings for SAP (C1a)

Making and downloading a branch's postings file needs
`dataexchange.export.run` **at that branch** (Finance, the Manager, the
Store Manager, an administrator); the organisation's new-customers file
carries names, phones and emails, so it needs `dataexchange.export.sensitive`.
Loading SAP's return file and sending a rejected posting again need
`dataexchange.import.approve` at that branch. Every file is fenced to the
organisation, refused during an assisted session, and audited when made,
downloaded and answered. A file that no longer matches its checksum is never
given out.

C1b adds the plant: its PDI usage decisions and vehicles to the yard are made
by whoever exports the plant's records (the Plant Manager, the Quality
Supervisor, an administrator) and answered by the Plant Manager (who approves
the plant's imports). **Sent to SAP** on a job card, service, PDI or customer
shows only to people who make or confirm that branch's postings (the
organisation's file for a customer); everyone else sees no box. SAP's own
master-data extract loads through Data Exchange like any update, so it needs
`dataexchange.import.run` to prepare and `dataexchange.import.approve` (by
someone else) to load.

### Updates from an edited export (P10)

Preparing needs `dataexchange.import.run`; approving needs
`dataexchange.import.approve` and the list's own right — `crm.manage` for
customers and vehicles, `store.parts.manage` for parts and suppliers — as
for any import of that list. Rows are matched only by EJO record, fenced to
the organisation (parts to the import's branch): a file can never reach
another organisation's or another branch's records. Each change is audited
on the record with its from and to; undo needs the same rights.

### The cut-over checklist (P9)

Anyone with a Data Exchange right (`dataexchange.import.run` or
`.approve`) sees every branch's checklist in their organisation. Marking a
step not needed, signing a branch off as cut over and reopening it need
`dataexchange.import.approve` **at that branch** (the Manager at a
workshop, the Plant Manager at the plant, an administrator anywhere), a
reason for every mark but the sign-off, and are refused during an assisted
session. Each is an audit entry, never edited; the sign-off is refused
while any step is unsettled.

### The plant demo (P3)

Loading or removing the demo records needs `admin.structure.manage` (an
administrator), typed words to confirm, and is refused during an assisted
session; both are audited. The 13 demo people on the plant are the demo
organisation's own people (below); they never carry a real person's name.

### The demo people (D1)

One sign-in for every role — eight at Headquarters (no branch, so
organisation-wide), seventeen at Isolo, sixteen at Afprint — and four
customer-portal sign-ins (`docs/KEWALRAM_DEMO.md`, generated from
`apps/portal/lib/demo/people.ts`). What keeps them safe:

- **Only a demo organisation** (`organisations.isDemo`) ever gets them; a
  demo person found anywhere else is switched off and signed out on the
  next run, never deleted.
- **No password in code.** The accounts exist only while
  `DEMO_STAFF_PASSWORD` (8+ characters) is set in the environment; nothing
  is printed. A password already set is never changed, and an account an
  administrator switched off stays off, unless `RESET_DEMO_PASSWORDS=yes`
  is set for one run (which also signs those accounts out).
- **Nothing is emailed:** every address is on `demo.kewalram.local`, a
  reserved name.
- **The rules hold for them as for anyone:** a demo technician sees only
  their jobs; the Finance Officer at Headquarters confirms no branch's
  money; a line operator cannot open a job card (`e2e/demo-people.spec.ts`).
- Every run is audited (`demo.people_loaded`); making the accounts is a
  deploy-time or terminal step (`npm run demo:people`, `npm run demo:reset`),
  not a portal action — the platform team's button comes with D3.

### The workshop demo (D2)

Six months of Isolo Branch (DEMO_WALKTHROUGH §15), loaded only into the
demo organisation, by the build the first time and by `npm run demo:reset`
after. Every record it makes is written as the demo people and obeys the
same rules the actions enforce (the tests in
`apps/portal/tests/workshop-demo.test.ts` check them: deposits at 70%
before work, closing only through a decided request, refunds only after a
cancellation, stock never negative, claims with their stage stamps). Every
record is listed in `demo_records`, so removing the demo deletes exactly
those — a person's own records are never touched. The load and the removal
are audited (`demo.workshop_loaded`); the demo's own audit entries are
removed with it under the trail's recorded maintenance switch, in one
transaction, so a reload never doubles a history.

### The role tour and its proofs (D4)

`docs/KEWALRAM_DEMO.md` gives each demo sign-in a first view, three clicks
and what it **must not** do; it is generated from
`apps/portal/lib/demo/tour.ts` (`npm run demo:tour-doc`). The promises are
checked twice: `tests/demo-tour.test.ts` runs each against the
authorization catalogue (a must-not page is refused by the person's roles, a
protected click is granted — using the same page list as the role matrix,
`lib/authz/page-areas.ts`), and `e2e/demo-tour.spec.ts` signs in as all 41
people and proves it in the browser, plus the branch fences on real demo
records (the plant's store officer cannot open an Isolo job card; a
technician cannot open a colleague's; Headquarters' Finance can) and the
reset refusing a hosted database.

### The demo every day, and the console (D3)

- **The daily pulse** writes as the demo people, only into an organisation
  marked as a demo with its workshop demo loaded, once per Lagos day
  (a unique marker claimed first, inside one transaction), and never money,
  stock, warranty, the plant or an email. Each record is listed in
  `demo_records` and goes with a reset. Audited (`demo.pulse`).
- **The console** (IT control room → Demo organisation) is the **platform
  team's only** (the Master Administrator): an organisation's
  Administrator and the IT Administrator never see it, and every action
  checks again on the server. Typed words confirm each change, it is
  refused during an assisted session, and it is audited
  (`demo.refreshed`, `demo.removed`, `demo.organisation_marked` /
  `_unmarked`). Unmarking switches the organisation's demo sign-ins off at
  once; a person's own records are never touched by a refresh or removal.

## The walkthrough

| Role | What this role does | What they see (menu · dashboard) | What they approve | What they never see |
|---|---|---|---|---|
| **Front Desk (Receptionist)** | Registers customers and vehicles, opens Job Cards and Vehicle Services, tells customers about approved estimates, asks for jobs to be closed, receives visitors. | Dashboard, Workshop, Customers, Security (visitors desk), Scheduling, Notifications. My numbers: *Ready for collection*, *Opened by me this month*. Action items: notify customer, check vehicle out. | Nothing (requests closes and cancellations). | Store costs, approvals, analytics, administration. |
| **Technician** | Accepts or turns down jobs assigned to them, inspects, writes the estimate, raises parts requests, drives road tests. | Dashboard, Workshop, Inventory (catalogue and stock only), My exit passes, My visitors, Notifications. My numbers: *My jobs in progress*, *Completed this month*, *Average time per job*, *My parts requests open*. A *My jobs* list. Action items: new assignments, approved road test they drive, their approved exit pass. | Nothing. | Gate registers (visitors, incidents, register, vehicles leaving), goods receipts, pricing and delivery costs, Approvals, analytics. |
| **Workshop Supervisor** | Accepts supervising a job, assigns the technician, checks and approves the estimate, marks work ready for collection. | Dashboard, Approvals, Workshop, Customers (read), Inventory (catalogue), My exit passes, My visitors, Notifications. My numbers: *Jobs I supervise*, plus the technician tiles (supervisors can also do the work). *My jobs* list. Action items: review a job, assign a technician, approve the estimate, mark ready. | Jobs assigned to them for supervision, and the estimates on those jobs. | Store costs, the gate, other supervisors' jobs in the activity feed. |
| **Workshop Manager** | The branch manager: final approval of estimates, closing and cancelling jobs, parts requests (first approval), outside purchases, warranty claims, exit passes, road tests, contractor passes. | Dashboard, Approvals, Workshop, Customers, Inventory, Warranty, My exit passes, My visitors (plus Road tests and Contractors tabs), Scheduling, Business Analytics, Notifications. My numbers: *Jobs in the workshop*, *Closed this month*. Approvals banner with the count. | Everything above for their branch. | The gate's registers (visitors, incidents, vehicles inside, people out). Opening jobs or recording payments. |
| **Finance Officer** | Records payments and refunds, reviews outside purchases, pays out cash once approved. | Dashboard, Approvals, Workshop (read), Inventory, My exit passes, My visitors, Business Analytics, Notifications. My numbers: *Payments I recorded this month*, *Outside purchases with Finance*. Activity: every payment, refund and outside purchase in the branch. | Outside purchases (review, then pay out). | The gate, approving purchases (the Manager does), administration. |
| **Store Manager** | Runs the store: parts, prices, stock levels, goods receipts, matching estimate parts, releasing parts. Authorises exit passes for the store team. | Dashboard, Approvals, Workshop (read), Inventory (all of it), My exit passes, My visitors, Deliveries, Notifications. My numbers: *Parts requests for the Store*, *Parts at or below reorder point*. | Parts requests (approve, reserve, release); exit passes for their department. | The gate registers, money, administration. |
| **Store Officer** | Records goods receipts, matches parts, approves, reserves and releases parts requests. | Same as the Store Manager, without exit-pass authorisation. | Parts requests (approve, reserve, release). | The gate registers, money, administration. |
| **Warranty HOD** | Registers and verifies warranties, approves claims, manages providers and policies. Authorises exit passes for the warranty team. Approves the warranties and open claims brought in from SAP at the cut-over (and only those imports). | Dashboard, Approvals, Workshop (read), Inventory (including goods receipts, to trace parts), Warranty, Data Exchange (warranty imports to approve), My exit passes, My visitors, Notifications. My numbers: *Warranties awaiting verification*, *Warranty claims open*. | Warranty verifications and claims, policy and provider removals, warranty and open-claim imports; exit passes for their department. | The gate, money, administration. |
| **Warranty Officer** | Registers warranties and prepares claims. | Like the Warranty HOD, without Approvals. | Nothing. | The gate, money, administration. |
| **Department Head** | Authorises exit passes for the people in their department. | Dashboard, Approvals, My exit passes, My visitors (plus Contractors: the passes they asked for or are responsible for), Scheduling, Notifications. | Exit passes (the Department Head step). | Workshop, Store, Warranty, the gate registers. |
| **Chief Security Officer** | Runs the Security desk and handles incidents. | Dashboard, Approvals, Security (the whole desk), Notifications. My numbers: *Visitors on site*, *Staff out on passes*, *Vehicles on road test*. Activity: all security records in the branch. | Incidents (assigns, closes, reopens). Exit passes only when they are someone's reporting manager. | Workshop, Store, money. |
| **Security Officer** | Works the gate: visitors, vehicles, deliveries, contractors, exit-pass times, incidents. | Dashboard, Security (the whole desk), Notifications. Same My numbers as the Chief. | Nothing. | Workshop records, Store costs, money. |
| **Calendar User** | Keeps their own calendar and books appointments and rooms. | Dashboard, My exit passes, My visitors, Scheduling, Notifications. My numbers: *My exit passes this month*. | Nothing. | Everything else. |
| **Scheduling Admin** | Manages rooms and aides, books on any calendar. | Dashboard, My exit passes, My visitors, Scheduling, Notifications. *Today's appointments* counts every calendar. | Nothing. | Everything else. |
| **Broadcaster** | Sends broadcasts to staff and customers. | Dashboard, My exit passes, My visitors, Notifications (with broadcasts). | Nothing. | Everything else. |
| **Branch Administrator** | Looks after one branch: people and their roles, and oversight of the branch. | Dashboard, Users, Workshop, Customers, Inventory, Warranty, Security, Scheduling, Business Analytics, Notifications — read-only oversight. | Nothing (gives roles). | Organisation set-up for other branches, the audit trail. |
| **Organisation Administrator** | Sets up the organisation for every branch; sees every module read-only, the audit trail and all analytics. | Every module, Administration, Audit Logs. Activity: everything in the organisation. | Nothing (does not approve money or open jobs). | Other organisations. |
| **Master Administrator** (platform team) | The platform owner and support staff. | Everything, in every organisation, plus Approvals (they may decide any step). | Any step. | — |

A person may hold several roles; they get what those roles allow together
(`supermanager@e2e.test` holds Workshop Supervisor and Workshop Manager and
still may not give final approval to an estimate they approved as supervisor).

## Security for people who are not on the desk

"Someone who goes under Security should only see what is theirs." Anyone
without `security.view` (everyone except Security, the Chief Security Officer,
Reception and the administrators' read-only oversight) gets two entries in the
menu and exactly two Security tabs:

- **My exit passes** (`/security/exit-passes`). Request a pass for yourself,
  for yourself and colleagues, or for colleagues only (staff are picked from
  your own organisation; people not on the staff list are typed by name). The
  list shows the passes you asked for or are on, and, for approvers, the ones
  waiting for your decision. The server fences the people on a pass to your
  organisation, whatever id the browser sends.
- **My visitors** (`/security/my-visitors`). Read-only: visitors booked for
  you today or later, visitors on site now (with "At reception" once the
  front desk has received them) and the last 90 days. The list is filtered on
  the server by the signed-in person as host (`listMyVisits` in
  `lib/actions/security.ts`), never by an id in the address, and fenced to the
  person's organisation. The page says: "Expecting someone? Ask the front desk
  or Security to register them."

Booking a visitor is desk work: `preRegisterVisit` and `updateBooking` refuse
anyone without the reception or gate permission, and the host's choice of
person is fenced to the desk's own organisation. The host can open each of
their visits (the visit page shows them *Back to My visitors*, not the desk's
list) and may cancel a booking that has not arrived; check-in, reception,
extending a stay and check-out stay with the desk.

When the gate lets a visitor in, the host gets an email and a dashboard/bell
item *Your visitor has arrived — name*, which becomes *Your visitor is at
reception — name* when the front desk receives them. Both open the visit page,
which the host can read.

Extra tabs only appear when the job needs them: Deliveries for the Store
(`store.grn.record`), Road tests and Contractors for people who approve them
(`security.pass.approve`). A technician who drives a road test follows it on
the Job Card, so the Road tests tab is not shown to them.

`e2e/staff-security.spec.ts` checks this end to end: a technician sees exactly
the two tabs, the front desk books a visitor for them and Security lets
another one in, both appear in their My visitors and nowhere for a colleague,
and the gate's pages answer *Access denied*.

## Approvals

`/approvals` lists every decision waiting for the signed-in person, grouped by
area (Workshop, Store, Money, Warranty, Security), oldest first. It is built from
the same live list as the dashboard and the bell (`getDashboardNotifications`),
so an item disappears the moment it is decided. Each item opens the record,
where the decision is made and checked again on the server. The menu entry
shows for anyone holding an approving permission (`APPROVAL_PERMISSIONS` in
the catalogue) and carries a live count; the page itself is open to everyone
signed in because it only ever lists what is waiting for the viewer (an exit
pass can be routed to anyone who is a reporting manager).

What counts as a decision: estimates to review, approve or finally approve;
jobs to supervise; close and cancellation requests; parts requests (HOD and
Store approval); outside purchases (Finance review, Manager approval);
warranty verifications, claims and policy/provider removals; exit passes,
road tests and contractor passes. Releasing parts, paying out cash, notifying
customers and checking vehicles out are work, not decisions, so they stay on
the dashboard's *Needs your attention*.

## Customers' data requests (A4c1)

A customer may ask what the business holds about them (a copy they can take
elsewhere), or for it to be corrected, erased, or no longer used (Nigeria
Data Protection Act 2023). **Data requests** (`/data-requests`) is for the
people who hold `privacy.requests.manage`, across the organisation: the
**Organisation Administrator** and the **Customer Care Lead**. No one else —
no branch role, not IT — sees the page, the customer page's *Record a data
request*, the copy or the DR- numbers in search.

- **Four eyes.** One records the request; a *different* person confirms who
  is asking (and how, in words — EJO refuses anything that looks like an ID
  number, so none is ever stored). The rule is checked in the write itself.
  Before that, no copy is made and the request cannot be answered.
- **The copy** is a zip (README, a CSV per kind of record, data.json) made
  from the live records at the moment of download — nothing is stored — for
  a request for a copy, once identity is confirmed and until a week after it
  is answered. It leaves out the staff who handled each record, passwords and
  tokens, and internal keys. Each download is audited with its SHA-256, which
  the request keeps. Never during an assisted session.
- **Closing** says what was done, or why it was refused (the customer is
  told). A request for a copy is answered only after its copy was downloaded.

## Access changes made in this pass (before → after, and why)

| Change | Before | After | Why |
|---|---|---|---|
| Workshop Manager: `security.view` removed | Full Security desk (gate dashboard, visitors, register, incidents, vehicles inside, people out) | *My exit passes*, plus the Road tests and Contractors tabs they approve | A manager approves passes; running the gate is Security's job. Approving still works: `security.pass.approve` is unchanged, and pass, permit and contractor pages open to the person deciding them. |
| Goods receipts (`/inventory/goods-receipts`, its detail and audit trail) | Anyone with `store.view` (technicians and supervisors included) | Anyone holding one of `store.parts.manage`, `store.grn.record`, `analytics.inventory.view`, `warranty.view` | Goods receipts show what the company paid suppliers. The Store, Finance, management and Warranty (which traces parts back to their receipts) need that; the workshop floor does not. |
| Recording a goods receipt (`/inventory/goods-receipts/new`) | Page opened for `store.view` (the button was hidden) | `store.grn.record` | The page is the form; people who cannot record a receipt are refused at the door. |
| Pricing Command Center (`/inventory/pricing`) and its server actions | `store.view` | The same four permissions as goods receipts | It shows delivery costs and margins. |
| Part detail page | Batches, serials, stock layers with cost, revenue and profit, the selling-price calculator and target margin editor for everyone with `store.view` | Shown only to the people above; others see stock on hand, fitment and warranty | Same reason. Links to goods receipts elsewhere (parts requests, deliveries) become plain reference numbers for people who cannot open them. |
| Editing a part (`/inventory/parts/[id]/edit`) | Page opened for `store.view` (saving was refused) | `store.parts.manage` | Refuse at the door rather than on save. |
| Activity feed: Workshop Supervisor | Every workshop event in the branch | Their own jobs and the records they act on | A supervisor runs the jobs given to them; the branch-wide feed was noise. The Workshop Manager keeps the whole area. |
| Dashboard quick action *Book a service* | Shown to anyone with `workshop.view` | Front desk only (`workshop.job_card.create`) | Booking is front-desk work; others were offered a form they cannot submit. |
| Dashboard *Today's appointments* | Every appointment in the branch, for anyone with a calendar | The person's own calendar; every calendar for the Scheduling Admin | It was counting other people's meetings. |
| Security tabs | Every tab shown to everyone; most led to Access denied | Only the tabs the person can open; one tab means no tab bar | "If I go under Security I should only see what I need." |
| My visitors (new) | A host could only reach a visit from an email link | `/security/my-visitors` and a menu entry for everyone off the desk | Staff see the visitors who came to see them, and nobody else's. |
| Changing a visitor booking (`updateBooking`) | The host or whoever booked it could change it | Security and Reception only | Visitors are booked at the desk; the host asks the desk. The edit page was already desk-only. |
| Road tests tab off the desk | Shown to everyone with `workshop.job_card.view` (technicians, supervisors) | Only to people who approve passes (`security.pass.approve`) | A technician follows a road test on the Job Card. The page itself is unchanged. |
| Contractors list for department heads | The whole organisation's contractor passes (department scope is not a branch filter) | The passes they asked for or are responsible for; the branch Manager and the desk still see all | They do not decide contractor passes; only the Manager does. |
| People on an exit pass, host of a visit | Any active user id was accepted | Only people in the requester's (or desk's) own organisation | Closes a cross-organisation id in a direct server-action call. |

No permission was widened. `role-matrix.spec.ts` reads the catalogue, so its
expectations follow these changes; the two goods-receipt/pricing rows now
list the four cost permissions. `inventory.spec.ts` now expects a technician
to be refused at `/inventory/goods-receipts/new`.

## Dashboards

Every dashboard has, in this order: the person's approvals banner (approvers
only), *My numbers this month* (`getMyNumbers` in `lib/actions/my-work.ts`),
*My jobs* (technicians and supervisors), quick actions, *Needs your attention*
and *What's new*. Each number is a count on indexed columns fenced to the
person's reach; the tiles shown depend on the permissions held, so a person
with two roles sees both sets.

## Enyo (the assistant)

Enyo answers **as the person asking**. Every tool it uses calls the module's
own authorised code (the same readers, `authorize` / `allows` / `reachWhere`
checks and organisation fences as the pages), so what Enyo can see for a role
is exactly what that role can see on the pages — never more. All tools are
offered for every question; a tool the person has no right to refuses on its
own, and Enyo says so kindly ("Not allowed: business figures are for Finance,
the Workshop Manager and administrators"). Enyo is never an authorisation
authority and never saves, sends, approves or pays: drafts open the normal page
pre-filled and the person presses the normal button.

| Role | What Enyo can tell them | What Enyo refuses |
|---|---|---|
| **Front Desk** | What is waiting for them, Job Cards and Vehicle Services in their branch (status, estimate, payments, balance, next step), customer profiles (Customers), vehicle histories, vehicles due a service; their calendar, passes and visitors; how-to steps for their pages. Prepares a pre-filled **Open Job Card** form. | Business figures, technician ranking, the Store (parts, prices, stock), warranty watch. |
| **Technician** | Their jobs and steps, Job Cards and Vehicle Services in their branch, vehicle histories (past complaints, diagnosis, work, findings, parts fitted), part prices and stock, service due, their calendar, passes and visitors. | Business figures, technician ranking, customer profiles (no Customers access), costs and margins, warranty watch. |
| **Workshop Supervisor** | As the technician, plus customer profiles (read). | Business figures, technician ranking, costs and margins. |
| **Workshop Manager** | Everything waiting for their decision, the branch's jobs, customers, business figures and technician ranking for the branch, warranty watch, stock alerts, costs and margins (inventory analytics). | Nothing in their branch; never another branch or organisation. |
| **Finance Officer** | Business figures (takings, revenue, profit) and technician ranking with labour billed, for their branch; jobs, payments and balances; part prices, costs and margins. | Customer profiles, warranty watch. |
| **Store Manager / Officer** | Stock alerts and pricing alerts, part prices, costs and margins, jobs (read), parts requests waiting on the Store. | Business figures, technician ranking, customer profiles, warranty watch. |
| **Warranty HOD / Officer** | Warranty watch (warranties ending, claims and deadlines), jobs (read), part prices and costs. | Business figures, technician ranking, customer profiles. |
| **Security, Department Head, Calendar User, Scheduling Admin, Broadcaster, Branch Assistant** | What is waiting for them, their calendar, their own exit passes and visitors (the Security desk: what the desk sees through search), and how-to steps for the pages they can open. | Workshop, Store, money, customers and warranty tools. |
| **Organisation Administrator** | Read-only oversight of everything the role sees (all branches), business figures, technician ranking, warranty watch, and the Enyo settings (`enyo.manage`). | Nothing outside their organisation. |

Also true for everyone:

- **Guide answers are filtered** by the same rule as the menu: a "how do I…"
  answer only links to pages the person can open; for anything else Enyo says
  it exists and who usually does it.
- **During an assisted session** Enyo works for the colleague being helped
  (read-only tools and drafts only). Earlier conversations of the colleague
  are not listed, and memory, deleting and settings refuse.
- **Conversations and remembered facts are personal**: only the person who
  had them can list, open, rename, rate or delete them. Questions are limited
  per person per minute (`ENYO_REQUESTS_PER_MINUTE`, default 20, counted in
  the database) and to 4,000 characters.

## Known gaps (left as they are)

- Reception holds `security.view`, so the front desk sees the whole Security
  desk, not only visitors. Narrowing it needs a separate reception permission
  for the visitor pages.
- The Chief Security Officer holds `security.pass.approve`, but the exit-pass
  head step goes to the requester's reporting manager or a department head
  (`HEAD_SLUGS` in `lib/actions/security.ts`), so in practice the Chief decides
  passes only as someone's reporting manager.
