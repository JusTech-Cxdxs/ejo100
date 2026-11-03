# The Kewalram demo — sign in as anyone

The demo organisation (**Kewalram Nigeria**, the one the base seed creates)
has a person for every role on its three places — **Headquarters**
(organisation-wide, no branch), **Isolo Branch** (the after-sales workshop
and its store) and **Afprint Assembly Plant** (kits, the line, quality,
PDI) — plus four customer-portal sign-ins. Pick a row, sign in, and the
portal shows that person's own view: their menu, their dashboard, their
branch and nothing else.

*This document is generated from `apps/portal/lib/demo/people.ts`; a test
keeps the two the same. The 15-minute director's tour and the "must not"
proofs per role arrive with the next demo release (D4).*

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

### Headquarters

| Sign in as | Role | Department | Employee no. | What to show |
|---|---|---|---|---|
| `admin@demo.kewalram.local` — Ngozi Adeyemi-Bakare | Organisation Administrator | — | DEMO-HQ-001 | Everything, read-only, and the set-up: Structure (both branches), Users and Roles, Settings, Branding, Data Exchange, the Recycle bin and the audit trail. Opens no job, approves no money. |
| `executive@demo.kewalram.local` — Olusegun Adebayo | Executive Director, Automobile Division | — | DEMO-HQ-002 | The daily brief, every module and all analytics read-only — the workshop, the store, warranty, the plant and the line. Broadcasts. Approves only what is escalated. |
| `it.admin@demo.kewalram.local` — Tobiloba Oyelaran | IT Administrator (Group IT) | — | DEMO-HQ-003 | Users and Roles, Settings, system health, the audit trail and error log, Enyo, Data Exchange imports and exports. No business transaction. |
| `finance.hq@demo.kewalram.local` — Kemi Oladipo-Nwachukwu | Finance Officer, Headquarters | — | DEMO-HQ-004 | Every branch’s payments, refunds and outside purchases, read across the organisation. Confirms nothing for a branch she does not belong to — the proof that money stays with the branch. |
| `care.lead@demo.kewalram.local` — Blessing Nwosu-Eze | Customer Care Lead | — | DEMO-HQ-005 | The Support centre for every branch: requests, complaints, hand-overs and the numbers; customer records. |
| `broadcaster@demo.kewalram.local` — Bimbo Akintola | Internal Communications Officer | — | DEMO-HQ-006 | Broadcasts: a notice to all staff, to a branch, or to customers. Nothing else. |
| `scheduling@demo.kewalram.local` — Sade Ogunbanjo | Scheduling Administrator | — | DEMO-HQ-007 | Meeting rooms and aides; books on anyone’s calendar; the appointment digest. |
| `calendar@demo.kewalram.local` — Cornelius Ibeh | Executive Assistant | — | DEMO-HQ-008 | His own calendar and appointments — and nothing of the workshop: the plainest proof of least privilege. |

### Isolo Branch (workshop)

| Sign in as | Role | Department | Employee no. | What to show |
|---|---|---|---|---|
| `isolo.admin@demo.kewalram.local` — Bolanle Fashola | Branch Administrator, Isolo | — | DEMO-WS-001 | Isolo’s people and roles, and the branch read-only. Cannot see the plant, cannot touch Headquarters’ set-up. |
| `manager@demo.kewalram.local` — Emeka Okonkwo | Branch Manager, Isolo | — | DEMO-WS-002 | Approvals: estimates (final), closing and cancelling jobs, parts requests, outside purchases, warranty claims, exit passes, road tests. Branch analytics. |
| `supervisor.passenger@demo.kewalram.local` — Ifeoma Chukwuma | Workshop Supervisor, Passenger Vehicles | workshop-passenger | DEMO-WS-003 | The passenger workshop’s job cards: accept, assign the technician, check the estimate, mark ready for collection. |
| `supervisor.commercial@demo.kewalram.local` — Abdulrahman Danjuma | Workshop Supervisor, Commercial Vehicles | workshop-commercial | DEMO-WS-004 | The truck bays: Isuzu job cards, the fleet customers, parts requests on their estimates. |
| `tech.passenger@demo.kewalram.local` — Tunde Adesanya | Technician, Passenger Vehicles | workshop-passenger | DEMO-WS-005 | The jobs assigned to him: accept, inspect, write the estimate, raise the parts request. Sees nobody else’s job. |
| `tech.commercial@demo.kewalram.local` — Kabiru Yusuf | Technician, Commercial Vehicles | workshop-commercial | DEMO-WS-006 | An Isuzu NQR in rework and a service in progress; the estimate he is writing. |
| `frontdesk@demo.kewalram.local` — Funmilayo Adebisi | Front Desk Officer | — | DEMO-WS-007 | Customers and vehicles, opening a job card or a vehicle service, today’s appointments, visitors expected. |
| `assistant@demo.kewalram.local` — Adaobi Nnamdi | Branch Assistant (IT support) | — | DEMO-WS-008 | Helps a colleague on their behalf with the colleague’s own password; every action recorded as done for them. Cannot help the Manager or Finance. |
| `store.manager@demo.kewalram.local` — Stella Oyinlola | Store Manager | store | DEMO-WS-009 | The store: stock, pricing alerts, goods receipts, suppliers, releasing parts; the stock alerts. |
| `store.officer@demo.kewalram.local` — Obinna Madu | Store Officer | store | DEMO-WS-010 | Matching estimate parts to stock, approving and reserving parts requests, recording a goods receipt (batch and serial). |
| `finance@demo.kewalram.local` — Femi Ajayi | Finance Officer, Isolo | — | DEMO-WS-011 | Payments and deposits on job cards, a refund, outside-purchase review, Finance sign-off on an import. |
| `warranty.hod@demo.kewalram.local` — Wale Oguntade | Head of Warranty | — | DEMO-WS-012 | Warranty claims at every stage, providers and policies, the claim waiting for his approval. |
| `warranty.officer@demo.kewalram.local` — Wuraola Balogun | Warranty Officer | — | DEMO-WS-013 | Registering a warranty, preparing a claim with its evidence — never approving one. |
| `cso@demo.kewalram.local` — Musa Garba | Chief Security Officer | — | DEMO-WS-014 | The Security desk: visitors, vehicles, exit passes, road tests, the overdue item on his list, incidents. |
| `gate@demo.kewalram.local` — Sunday Okon | Security Officer, Main Gate | — | DEMO-WS-015 | The gate: sign a visitor in, a vehicle out on its exit pass, a road test back in. |
| `care@demo.kewalram.local` — Chidinma Okafor | Customer Care Officer, Isolo | — | DEMO-WS-016 | Isolo’s Support centre: open requests, the complaint, Enyo’s draft reply, the customer’s jobs and warranties to answer from. |
| `dept.head@demo.kewalram.local` — Dayo Olawale | Head of Department, Commercial Vehicles | workshop-commercial | DEMO-WS-017 | Authorises his department’s exit passes before the Manager approves them — and nothing else. |

### Afprint Assembly Plant

| Sign in as | Role | Department | Employee no. | What to show |
|---|---|---|---|---|
| `plant.manager@demo.kewalram.local` — Adaeze Okafor | Plant Manager | plant-production | DEMO-AP-001 | The plant: every vehicle from kit to yard, kits to release, PDIs to approve, the line board, the figures. |
| `production@demo.kewalram.local` — Musa Bello | Production Supervisor | plant-production | DEMO-AP-002 | The line board: vehicles at their stations, the bottleneck, defects in rework, the routes he edits. |
| `operator.1@demo.kewalram.local` — Chinedu Eze | Line Operator, Chassis | plant-production | DEMO-AP-003 | His station: the checks, a torque reading against its limits, a defect raised. Cannot pass the gate. |
| `operator.2@demo.kewalram.local` — Gbenga Ogunleye | Line Operator, Cab | plant-production | DEMO-AP-004 | The cab station on the Isuzu line. |
| `operator.3@demo.kewalram.local` — Ifeanyi Nwosu | Line Operator, Trim | plant-production | DEMO-AP-005 | The trim station on the S07 line. |
| `operator.4@demo.kewalram.local` — Sadiq Abubakar | Line Operator, Final | plant-production | DEMO-AP-006 | Wheels, fluids and first start. |
| `qc@demo.kewalram.local` — Funke Adeyemi | QC Inspector | plant-quality | DEMO-AP-007 | End-of-line tests, the road test, the final gate, verifying reworked defects — never a check she recorded herself. |
| `quality@demo.kewalram.local` — Ngozi Okonkwo | Quality Supervisor | plant-quality | DEMO-AP-008 | Kits checked by colleagues to release, hold or reject (never her own); shortages and damage to supplier claims. |
| `qa@demo.kewalram.local` — Halima Ibrahim | QA Auditor | plant-quality | DEMO-AP-009 | The daily QA audit: a finished vehicle re-inspected and scored; the one that failed and went back to rework. |
| `kit.inspector.1@demo.kewalram.local` — Kelechi Balogun | Kit Inspector | plant-kit-receiving | DEMO-AP-010 | A shipment arriving: open each kit, check it against the packing list, raise a shortage. |
| `kit.inspector.2@demo.kewalram.local` — Damilola Adebayo | Kit Inspector | plant-kit-receiving | DEMO-AP-011 | The second inspector: the kit with damage in transit. |
| `pdi@demo.kewalram.local` — Rotimi Yusuf | PDI Inspector | plant-pdi | DEMO-AP-012 | A pre-delivery inspection on the tablet: the checklist, the scan, the readings, the label. |
| `pdi.supervisor@demo.kewalram.local` — Temitope Okoro | PDI Supervisor | plant-pdi | DEMO-AP-013 | Colleagues’ PDIs to accept or reject back to rework — never her own. |
| `afprint.admin@demo.kewalram.local` — Yetunde Alabi-Lawal | Branch Administrator, Afprint | — | DEMO-AP-014 | The plant’s people and roles, and the plant read-only. Cannot see Isolo’s job cards. |
| `kit.store@demo.kewalram.local` — Uchenna Obi | Store Officer, Kit Store | plant-kit-receiving | DEMO-AP-015 | The kit store: cases received against each kit, the parts on the shelf for the line. |
| `plant.gate@demo.kewalram.local` — Ibrahim Shehu | Security Officer, Plant Gate | — | DEMO-AP-016 | The plant gate: containers in, a finished vehicle out to Isolo on its pass, the road test back. |

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

The workshop's six months (customers, vehicles, job cards in every status,
the store, warranty, security, scheduling, support) and the daily life of
the demo arrive with the next demo releases (D2, D3); the plant's six weeks
are already there (DEMO_WALKTHROUGH §13). The four customers above exist
from the first run so the portal can be shown at once; their vehicles,
jobs, warranty claim and Afprint-built vehicle come with D2.
