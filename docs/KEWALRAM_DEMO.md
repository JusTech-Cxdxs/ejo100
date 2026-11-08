# The Kewalram demo — sign in as anyone

The demo organisation (**Kewalram Nigeria**, the one the base seed creates)
has a person for every role on its three places — **Headquarters**
(organisation-wide, no branch), **Isolo Branch** (the after-sales workshop
and its store) and **Afprint Assembly Plant** (kits, the line, quality,
PDI) — plus four customer-portal sign-ins. Pick a row, sign in, and the
portal shows that person's own view: their menu, their dashboard, their
branch and nothing else.

Each row says what that person sees first, **three clicks** that show
their job, and what they **must not** be able to do — try it: the portal
answers *Access denied*.

*Generated from `apps/portal/lib/demo/people.ts` and `lib/demo/tour.ts`
by `npm run demo:tour-doc`. A test fails if this file and those two ever
differ, and checks every "must not" and every click against the
authorization catalogue; `e2e/demo-tour.spec.ts` signs in as every person
and proves each one in the browser.*

## The 15-minute tour for the directors

Sign in as each person in turn (every address ends with
`@demo.kewalram.local`; the customer at the portal's *Customer portal* page).

| Minutes | Sign in as | Open | Show |
|---|---|---|---|
| 0–2 | `executive` | `/dashboard` | The daily brief: both branches in one view — job cards open today, the bottleneck on the line, money in, claims pending. |
| 2–4 | `frontdesk` | `/workshop/customers` | A vehicle checked in this morning: the customer, the vehicle’s history from SAP, the job card opened with its 6-digit number. |
| 4–6 | `tech.commercial` | `/workshop/job-cards` | Only his jobs. Open one: the inspection, the estimate he writes, the parts he asks the store for. |
| 6–8 | `manager` | `/approvals` | Approvals in one place: the estimate (Manager’s final word), a closing, an exit pass. Then the service tracker: who is due, who is overdue. |
| 8–9 | `store.manager` | `/inventory/pricing` | Stock below reorder, the pricing alert that would have lost money, a receipt with batch and serial numbers. |
| 9–10 | `warranty.hod` | `/warranty/claims` | Nine claims, one at each stage, and the money claimed back from the makers. |
| 10–12 | `production` | `/plant/line` | Afprint: the line board — every truck at its station, the bottleneck, a defect in rework; then a vehicle’s passport from kit to PDI. |
| 12–13 | `cso` | `/security/overdue` | Security: the visitor three hours past his time, the exit pass not back yet — what used to be a paper register. |
| 13–14 | `customer.adaora` | `/customer-portal` | The customer portal: her S07’s service in progress, the estimate to approve, the next service due. |
| 14–15 | `admin` | `/audit-logs` | Control: every action in the audit trail, nothing deleted for good (the Recycle bin), each role only where it belongs. |

## The password

There is **one password for every demo sign-in**, and it is never written
down anywhere in the code or the documentation. It is whatever
`DEMO_STAFF_PASSWORD` is set to in the hosting environment (Vercel →
Settings → Environment Variables → Production), 8 characters or more; the
customer-portal sign-ins use `DEMO_CUSTOMER_PASSWORD` when that is set and
the staff password otherwise.

- **Not set:** no demo sign-ins exist at all. Set it and redeploy: the
  production build makes them (`scripts/db-push-if-vercel.js`, right after
  the schema). From a terminal: `npm run demo:people`.
- **Already made:** a later build changes nothing — not a password, not an
  account an administrator switched off. To set every demo password again
  (for example after the demo), set `RESET_DEMO_PASSWORDS=yes` for one
  deploy and remove it; everyone signed in as a demo person is signed out.
- **Only the demo organisation** gets demo people: the one marked
  `isDemo` in `organisations` (the first run marks the seed's own,
  `kewalram-nigeria`, or `DEMO_ORG_SLUG`). A demo person found in any
  other organisation is switched off on the next run — never deleted.
- Every address ends with `@demo.kewalram.local`, a name that is never
  routed: nothing is ever emailed to a demo person, and no real colleague
  can collide with one. Employee numbers start with `DEMO-`.
- Every run is audited (`demo.people_loaded`, with counts).

## The people

### Headquarters (organisation-wide, no branch)

| Sign in as | Role · employee no. | First view | Three clicks | Must not |
|---|---|---|---|---|
| `admin@demo.kewalram.local` — Ngozi Adeyemi-Bakare | Organisation Administrator · DEMO-HQ-001 | The dashboard with both branches, the set-up tiles and the day’s audit activity. | 1. Users and roles of both branches (`/users`)<br>2. Structure: Headquarters, Isolo, Afprint (`/structure`)<br>3. The audit trail (`/audit-logs`) | Sees everything read-only; opens no job and approves no money (no page to refuse). |
| `executive@demo.kewalram.local` — Olusegun Adebayo | Executive Director, Automobile Division · DEMO-HQ-002 | The daily brief: job cards open, the bottleneck on the line, money in, claims pending. | 1. Headquarters: both branches side by side (`/headquarters`)<br>2. The line board at Afprint (`/plant/line`)<br>3. Business analytics (`/analytics`) | manage users (`/users`)<br>change settings (`/settings`) |
| `it.admin@demo.kewalram.local` — Tobiloba Oyelaran | IT Administrator (Group IT) · DEMO-HQ-003 | The IT control room: health, scheduled jobs, sign-in attempts. | 1. IT control room (`/it`)<br>2. Users (`/users`)<br>3. Data Exchange: the cut-over imports (`/data-exchange`) | open the job cards (`/workshop/job-cards`)<br>open the assembly plant (`/plant`)<br>open warranty (`/warranty`) |
| `finance.hq@demo.kewalram.local` — Kemi Oladipo-Nwachukwu | Finance Officer, Headquarters · DEMO-HQ-004 | Money across both branches: payments, refunds, outside purchases. | 1. Refunds (`/workshop/refunds`)<br>2. Outside purchases (`/workshop/external-procurement`)<br>3. Delivery costs and margins (`/inventory/pricing`) | manage users (`/users`)<br>open the line (`/plant/line`) |
| `care.lead@demo.kewalram.local` — Blessing Nwosu-Eze | Customer Care Lead · DEMO-HQ-005 | The Support centre for every branch: open requests, complaints, due times. | 1. Support centre (`/crm/support`)<br>2. Support analytics (`/crm/support/analytics`)<br>3. Customers (`/crm`) | open the store (`/inventory`)<br>open the assembly plant (`/plant`) |
| `broadcaster@demo.kewalram.local` — Bimbo Akintola | Internal Communications Officer · DEMO-HQ-006 | Broadcasts: what is running, to whom, and who has read it. | 1. Broadcasts (`/notifications/broadcasts`)<br>2. New broadcast (`/notifications/broadcasts/new`)<br>3. Broadcast analytics (`/notifications/broadcasts/analytics`) | open the job cards (`/workshop/job-cards`)<br>open the store (`/inventory`)<br>manage users (`/users`) |
| `scheduling@demo.kewalram.local` — Sade Ogunbanjo | Scheduling Administrator · DEMO-HQ-007 | Today’s appointments and the rooms. | 1. Schedule (`/schedule`)<br>2. Meeting rooms (`/schedule/rooms`)<br>3. Calendar (`/schedule/calendar`) | open the job cards (`/workshop/job-cards`)<br>open the store (`/inventory`) |
| `calendar@demo.kewalram.local` — Cornelius Ibeh | Executive Assistant · DEMO-HQ-008 | His own calendar — and nothing of the workshop. | 1. My schedule (`/schedule`)<br>2. Calendar (`/schedule/calendar`)<br>3. My profile (`/profile`) | open the job cards (`/workshop/job-cards`)<br>open the assembly plant (`/plant`)<br>open the store (`/inventory`) |

### Isolo Branch — the workshop and its store

| Sign in as | Role · employee no. | First view | Three clicks | Must not |
|---|---|---|---|---|
| `isolo.admin@demo.kewalram.local` — Bolanle Fashola | Branch Administrator, Isolo · DEMO-WS-001 | Isolo’s people and the branch at a glance. | 1. Users at Isolo (`/users`)<br>2. The organisation’s people (`/organisation/people`)<br>3. Isolo’s job cards (read-only) (`/workshop/job-cards`) | change settings (`/settings`)<br>change the organisation’s structure (`/structure`) |
| `manager@demo.kewalram.local` — Emeka Okonkwo | Branch Manager, Isolo · DEMO-WS-002 | Approvals waiting: estimates, closings, parts, outside purchases, exit passes. | 1. Approvals (`/approvals`)<br>2. Job cards: every status today (`/workshop/job-cards`)<br>3. The service tracker (`/workshop/service-tracker`) | manage users (`/users`)<br>open the assembly plant (`/plant`) |
| `supervisor.passenger@demo.kewalram.local` — Ifeoma Chukwuma | Workshop Supervisor, Passenger Vehicles · workshop-passenger · DEMO-WS-003 | The passenger workshop’s job cards to accept, assign and check. | 1. Job cards (`/workshop/job-cards`)<br>2. Vehicle services (`/workshop/vehicle-service`)<br>3. Parts requests (`/workshop/parts-requests`) | manage users (`/users`)<br>open the assembly plant (`/plant`)<br>see delivery costs and margins (`/inventory/pricing`) |
| `supervisor.commercial@demo.kewalram.local` — Abdulrahman Danjuma | Workshop Supervisor, Commercial Vehicles · workshop-commercial · DEMO-WS-004 | The truck bays: Isuzu job cards and fleet customers. | 1. Job cards (`/workshop/job-cards`)<br>2. Customers (`/workshop/customers`)<br>3. Road tests (`/security/road-tests`) | manage users (`/users`)<br>open the assembly plant (`/plant`)<br>see delivery costs and margins (`/inventory/pricing`) |
| `tech.passenger@demo.kewalram.local` — Tunde Adesanya | Technician, Passenger Vehicles · workshop-passenger · DEMO-WS-005 | His own jobs only, with what to do next on each. | 1. My job cards (`/workshop/job-cards`)<br>2. My vehicle services (`/workshop/vehicle-service`)<br>3. My profile (`/profile`) | open the assembly plant (`/plant`)<br>see delivery costs and margins (`/inventory/pricing`)<br>manage users (`/users`) |
| `tech.commercial@demo.kewalram.local` — Kabiru Yusuf | Technician, Commercial Vehicles · workshop-commercial · DEMO-WS-006 | An Isuzu in rework, a service in progress, an estimate to write. | 1. My job cards (`/workshop/job-cards`)<br>2. My vehicle services (`/workshop/vehicle-service`)<br>3. Exit passes (`/security/exit-passes`) | open the assembly plant (`/plant`)<br>see delivery costs and margins (`/inventory/pricing`)<br>read the audit trail (`/audit-logs`) |
| `frontdesk@demo.kewalram.local` — Funmilayo Adebisi | Front Desk Officer · DEMO-WS-007 | Today’s check-ins, appointments and visitors expected. | 1. Customers (`/workshop/customers`)<br>2. Book a service (`/workshop/vehicle-service/book`)<br>3. My visitors (`/security/my-visitors`) | see delivery costs and margins (`/inventory/pricing`)<br>open the assembly plant (`/plant`)<br>manage users (`/users`) |
| `assistant@demo.kewalram.local` — Adaobi Nnamdi | Branch Assistant (IT support) · DEMO-WS-008 | Help a colleague: start an assisted session, see who asked for help. | 1. Assist a colleague (`/support/assist`)<br>2. Get help requests (`/support/help`)<br>3. My profile (`/profile`) | open the job cards (`/workshop/job-cards`)<br>open the assembly plant (`/plant`)<br>manage users (`/users`) |
| `store.manager@demo.kewalram.local` — Stella Oyinlola | Store Manager · store · DEMO-WS-009 | The store: stock alerts, pricing alerts, receipts. | 1. Parts and stock (`/inventory/parts`)<br>2. Pricing alerts (`/inventory/pricing`)<br>3. Goods receipts (`/inventory/goods-receipts`) | open the assembly plant (`/plant`)<br>manage users (`/users`) |
| `store.officer@demo.kewalram.local` — Obinna Madu | Store Officer · store · DEMO-WS-010 | Estimates to match and parts requests to approve. | 1. Estimate matching (`/inventory/estimate-matching`)<br>2. Parts requests (`/workshop/parts-requests`)<br>3. Record a goods receipt (`/inventory/goods-receipts/new`) | open the assembly plant (`/plant`)<br>manage users (`/users`)<br>open business analytics (`/analytics`) |
| `finance@demo.kewalram.local` — Femi Ajayi | Finance Officer, Isolo · DEMO-WS-011 | Isolo’s money: deposits, balances, a refund, outside purchases. | 1. Refunds (`/workshop/refunds`)<br>2. Outside purchases (`/workshop/external-procurement`)<br>3. Data Exchange: Finance sign-off (`/data-exchange`) | manage users (`/users`)<br>open the assembly plant (`/plant`) |
| `warranty.hod@demo.kewalram.local` — Wale Oguntade | Head of Warranty · DEMO-WS-012 | Claims at every stage; the one waiting for his approval. | 1. Warranty claims (`/warranty/claims`)<br>2. Policies (`/warranty/policies`)<br>3. Warranty analytics (`/warranty/analytics`) | manage users (`/users`)<br>change settings (`/settings`) |
| `warranty.officer@demo.kewalram.local` — Wuraola Balogun | Warranty Officer · DEMO-WS-013 | Warranties to register and claims to prepare. | 1. Warranties (`/warranty`)<br>2. Register a warranty (`/warranty/register`)<br>3. Claims (`/warranty/claims`) | manage users (`/users`)<br>open the assembly plant (`/plant`)<br>open business analytics (`/analytics`) |
| `cso@demo.kewalram.local` — Musa Garba | Chief Security Officer · DEMO-WS-014 | The Security desk: overdue items first. | 1. Overdue (`/security/overdue`)<br>2. Incidents (`/security/incidents`)<br>3. On the premises (`/security/on-premises`) | open the job cards (`/workshop/job-cards`)<br>manage users (`/users`)<br>open the store (`/inventory`) |
| `gate@demo.kewalram.local` — Sunday Okon | Security Officer, Main Gate · DEMO-WS-015 | The gate: who is expected, who is in, what is going out. | 1. The register (`/security/register`)<br>2. Visitors (`/security/visitors`)<br>3. Vehicles inside (`/security/vehicles-inside`) | open the job cards (`/workshop/job-cards`)<br>manage users (`/users`)<br>open the store (`/inventory`) |
| `care@demo.kewalram.local` — Chidinma Okafor | Customer Care Officer, Isolo · DEMO-WS-016 | Isolo’s Support centre: the complaint about a scratch, Enyo’s drafts. | 1. Support centre (`/crm/support`)<br>2. Customers (`/crm`)<br>3. New request (`/crm/support/new`) | open the store (`/inventory`)<br>open the assembly plant (`/plant`)<br>manage users (`/users`) |
| `dept.head@demo.kewalram.local` — Dayo Olawale | Head of Department, Commercial Vehicles · workshop-commercial · DEMO-WS-017 | Exit passes waiting for the head of department. | 1. Exit passes (`/security/exit-passes`)<br>2. Approvals (`/approvals`)<br>3. My profile (`/profile`) | manage users (`/users`)<br>open the assembly plant (`/plant`)<br>open the store (`/inventory`) |

### Afprint Assembly Plant

| Sign in as | Role · employee no. | First view | Three clicks | Must not |
|---|---|---|---|---|
| `plant.manager@demo.kewalram.local` — Adaeze Okafor | Plant Manager · plant-production · DEMO-AP-001 | The plant: vehicles by stage, kits to release, PDIs to approve. | 1. The plant (`/plant`)<br>2. The line board (`/plant/line`)<br>3. QA audits (`/plant/qa`) | open the job cards (`/workshop/job-cards`)<br>manage users (`/users`) |
| `production@demo.kewalram.local` — Musa Bello | Production Supervisor · plant-production · DEMO-AP-002 | The line board: who is at which station, the bottleneck. | 1. The line board (`/plant/line`)<br>2. Routes (`/plant/routes`)<br>3. Plant vehicles (`/plant/vehicles`) | open the job cards (`/workshop/job-cards`)<br>manage users (`/users`)<br>open the store (`/inventory`) |
| `operator.1@demo.kewalram.local` — Chinedu Eze | Line Operator, Chassis · plant-production · DEMO-AP-003 | His station and the vehicle at it. | 1. The line (`/plant/line`)<br>2. Plant vehicles (`/plant/vehicles`)<br>3. My profile (`/profile`) | open the job cards (`/workshop/job-cards`)<br>manage users (`/users`)<br>open the store (`/inventory`) |
| `operator.2@demo.kewalram.local` — Gbenga Ogunleye | Line Operator, Cab · plant-production · DEMO-AP-004 | The cab station on the Isuzu line. | 1. The line (`/plant/line`)<br>2. Plant vehicles (`/plant/vehicles`)<br>3. My profile (`/profile`) | open the job cards (`/workshop/job-cards`)<br>manage users (`/users`)<br>open the store (`/inventory`) |
| `operator.3@demo.kewalram.local` — Ifeanyi Nwosu | Line Operator, Trim · plant-production · DEMO-AP-005 | The trim station on the S07 line. | 1. The line (`/plant/line`)<br>2. Plant vehicles (`/plant/vehicles`)<br>3. My profile (`/profile`) | open the job cards (`/workshop/job-cards`)<br>manage users (`/users`)<br>open the store (`/inventory`) |
| `operator.4@demo.kewalram.local` — Sadiq Abubakar | Line Operator, Final · plant-production · DEMO-AP-006 | Wheels, fluids and first start. | 1. The line (`/plant/line`)<br>2. Plant vehicles (`/plant/vehicles`)<br>3. My profile (`/profile`) | open the job cards (`/workshop/job-cards`)<br>manage users (`/users`)<br>open the store (`/inventory`) |
| `qc@demo.kewalram.local` — Funke Adeyemi | QC Inspector · plant-quality · DEMO-AP-007 | Tests and the final gate waiting for her. | 1. The line (`/plant/line`)<br>2. Plant vehicles (`/plant/vehicles`)<br>3. QA audits (`/plant/qa`) | open the job cards (`/workshop/job-cards`)<br>manage users (`/users`) |
| `quality@demo.kewalram.local` — Ngozi Okonkwo | Quality Supervisor · plant-quality · DEMO-AP-008 | Kits checked by colleagues, waiting to be released. | 1. Kits (`/plant/kits`)<br>2. Shipments (`/plant/shipments`)<br>3. QA audits (`/plant/qa`) | open the job cards (`/workshop/job-cards`)<br>manage users (`/users`) |
| `qa@demo.kewalram.local` — Halima Ibrahim | QA Auditor · plant-quality · DEMO-AP-009 | The daily QA audit: a finished vehicle to re-inspect. | 1. QA audits (`/plant/qa`)<br>2. Plant vehicles (`/plant/vehicles`)<br>3. The line (`/plant/line`) | open the job cards (`/workshop/job-cards`)<br>manage users (`/users`) |
| `kit.inspector.1@demo.kewalram.local` — Kelechi Balogun | Kit Inspector · plant-kit-receiving · DEMO-AP-010 | Shipments arriving and kits to check. | 1. Shipments (`/plant/shipments`)<br>2. Kits (`/plant/kits`)<br>3. Receive a shipment (`/plant/shipments/new`) | open the job cards (`/workshop/job-cards`)<br>manage users (`/users`) |
| `kit.inspector.2@demo.kewalram.local` — Damilola Adebayo | Kit Inspector · plant-kit-receiving · DEMO-AP-011 | The kit with damage in transit. | 1. Kits (`/plant/kits`)<br>2. Shipments (`/plant/shipments`)<br>3. My profile (`/profile`) | open the job cards (`/workshop/job-cards`)<br>manage users (`/users`) |
| `pdi@demo.kewalram.local` — Rotimi Yusuf | PDI Inspector · plant-pdi · DEMO-AP-012 | Pre-delivery inspections to do on the tablet. | 1. The plant (`/plant`)<br>2. Plant vehicles (`/plant/vehicles`)<br>3. My profile (`/profile`) | open the job cards (`/workshop/job-cards`)<br>manage users (`/users`) |
| `pdi.supervisor@demo.kewalram.local` — Temitope Okoro | PDI Supervisor · plant-pdi · DEMO-AP-013 | Colleagues’ PDIs to accept or send back. | 1. The plant (`/plant`)<br>2. Plant vehicles (`/plant/vehicles`)<br>3. QA audits (`/plant/qa`) | open the job cards (`/workshop/job-cards`)<br>manage users (`/users`) |
| `afprint.admin@demo.kewalram.local` — Yetunde Alabi-Lawal | Branch Administrator, Afprint · DEMO-AP-014 | The plant’s people and the plant at a glance. | 1. Users at Afprint (`/users`)<br>2. The plant (read-only) (`/plant`)<br>3. The organisation’s people (`/organisation/people`) | change settings (`/settings`)<br>change the organisation’s structure (`/structure`) |
| `kit.store@demo.kewalram.local` — Uchenna Obi | Store Officer, Kit Store · plant-kit-receiving · DEMO-AP-015 | The plant’s own store: the parts on the shelf for the line and what came in. | 1. Parts and stock (`/inventory/parts`)<br>2. Goods receipts (`/inventory/goods-receipts`)<br>3. Record a goods receipt (`/inventory/goods-receipts/new`) | manage users (`/users`)<br>open the line (`/plant/line`) |
| `plant.gate@demo.kewalram.local` — Ibrahim Shehu | Security Officer, Plant Gate · DEMO-AP-016 | The plant gate: containers in, vehicles out. | 1. The register (`/security/register`)<br>2. Visitors (`/security/visitors`)<br>3. Vehicles inside (`/security/vehicles-inside`) | open the job cards (`/workshop/job-cards`)<br>manage users (`/users`)<br>open the store (`/inventory`) |

### Customer portal

| Sign in as | Who | What to show |
|---|---|---|
| `customer.adaora@demo.kewalram.local` | Adaora Chukwu | Her Soueast S07: the service in progress, the estimate to approve, her service history and the next service due. |
| `customer.fleet@demo.kewalram.local` | Dangiwa Haulage Limited (fleet) | A fleet of Isuzu trucks: the job cards open today, an invoice to pay, the vehicle due for its 40,000 km service. |
| `customer.warranty@demo.kewalram.local` | Chukwuemeka Nwankwo | His warranty and the claim under review — where it stands, what Kewalram asked for. |
| `customer.afprint@demo.kewalram.local` | Halima Abdullahi | A vehicle built at Afprint: its passport from kit to PDI certificate, and its first service at Isolo. |

## What each place proves

- **Headquarters** people have no branch, so the authorization catalogue
  treats them as organisation-wide: they see both branches, read-only
  where their role says so (the Executive, the Administrator), and the
  Finance Officer at Headquarters can look at every branch's money but
  confirm none of it — money stays with the branch that earned it.
- **Isolo** people are fenced to Isolo: a technician sees only the jobs
  assigned to them; the Branch Administrator manages Isolo's people and
  cannot see the plant.
- **Afprint** people are fenced to the plant: a line operator records
  their station's checks and cannot open a job card; the gate is passed by
  quality, never by the person who recorded the check.

The plant demo (DEMO_WALKTHROUGH §13) puts the Afprint people on the line,
in kit receiving, quality and PDI: they are these same accounts.

## Where the records come from

The plant's six weeks (DEMO_WALKTHROUGH §13) and the workshop's six months
(§15) are loaded once by the first production build after
`DEMO_STAFF_PASSWORD` is set (`npm run demo:ensure`), as of that minute:
customers, vehicles, job cards in every status, services, the store,
warranty and claims, security, scheduling, support, imports and exports,
and the six Afprint-built vehicles sold through Isolo. A later deploy
leaves what people did in the demo alone; `npm run demo:reset` starts the
story again from now, removing exactly the demo's own records. The four
customers above each have their story: Adaora's S07 in service today, the
fleet's trucks (one open job card, one ready for collection), the warranty
customer's submitted claim, the Afprint-built NQR with its passport.

## Every day after

The demo does not go stale: each Lagos day adds its own working day —
check-ins this morning, yesterday's estimates written and approved and
waiting for the Manager, visitors, the morning meeting, new support
requests (DEMO_WALKTHROUGH §16). `DEMO_DAILY_ACTIVITY=off` stops it. The
platform team reloads the whole story from **IT control room → Demo
organisation**, or from a terminal with `npm run demo:reset`.
