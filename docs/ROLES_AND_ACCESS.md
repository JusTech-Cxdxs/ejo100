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
  *My exit passes* (or *Exit passes* for the Security desk). That is the only
  thing every employee is granted by default.
- **Notifications are personal.** The bell and the dashboard's *Needs your
  attention* list only steps waiting on that person. The activity feed shows
  the records they are part of (jobs they work on, supervise or opened, their
  own requests and passes); heads of a department (Workshop Manager, Store
  Manager, Warranty HOD, Chief Security Officer, Scheduling Admin) also see
  their whole area, and the Organisation Administrator sees everything — all
  limited to their own organisation, and to their branch for branch-scoped
  people.

## The walkthrough

| Role | What this role does | What they see (menu · dashboard) | What they approve | What they never see |
|---|---|---|---|---|
| **Front Desk (Receptionist)** | Registers customers and vehicles, opens Job Cards and Vehicle Services, tells customers about approved estimates, asks for jobs to be closed, receives visitors. | Dashboard, Workshop, Customers, Security (visitors desk), Scheduling, Notifications. My numbers: *Ready for collection*, *Opened by me this month*. Action items: notify customer, check vehicle out. | Nothing (requests closes and cancellations). | Store costs, approvals, analytics, administration. |
| **Technician** | Accepts or turns down jobs assigned to them, inspects, writes the estimate, raises parts requests, drives road tests. | Dashboard, Workshop, Inventory (catalogue and stock only), My exit passes, Notifications. My numbers: *My jobs in progress*, *Completed this month*, *Average time per job*, *My parts requests open*. A *My jobs* list. Action items: new assignments, approved road test they drive, their approved exit pass. | Nothing. | Gate registers (visitors, incidents, register, vehicles leaving), goods receipts, pricing and delivery costs, Approvals, analytics. |
| **Workshop Supervisor** | Accepts supervising a job, assigns the technician, checks and approves the estimate, marks work ready for collection. | Dashboard, Approvals, Workshop, Customers (read), Inventory (catalogue), My exit passes, Notifications. My numbers: *Jobs I supervise*, plus the technician tiles (supervisors can also do the work). *My jobs* list. Action items: review a job, assign a technician, approve the estimate, mark ready. | Jobs assigned to them for supervision, and the estimates on those jobs. | Store costs, the gate, other supervisors' jobs in the activity feed. |
| **Workshop Manager** | The branch manager: final approval of estimates, closing and cancelling jobs, parts requests (first approval), outside purchases, warranty claims, exit passes, road tests, contractor passes. | Dashboard, Approvals, Workshop, Customers, Inventory, Warranty, My exit passes (plus Road tests and Contractors tabs), Scheduling, Business Analytics, Notifications. My numbers: *Jobs in the workshop*, *Closed this month*. Approvals banner with the count. | Everything above for their branch. | The gate's registers (visitors, incidents, vehicles inside, people out). Opening jobs or recording payments. |
| **Finance Officer** | Records payments and refunds, reviews outside purchases, pays out cash once approved. | Dashboard, Approvals, Workshop (read), Inventory, My exit passes, Business Analytics, Notifications. My numbers: *Payments I recorded this month*, *Outside purchases with Finance*. Activity: every payment, refund and outside purchase in the branch. | Outside purchases (review, then pay out). | The gate, approving purchases (the Manager does), administration. |
| **Store Manager** | Runs the store: parts, prices, stock levels, goods receipts, matching estimate parts, releasing parts. Authorises exit passes for the store team. | Dashboard, Approvals, Workshop (read), Inventory (all of it), My exit passes, Deliveries, Notifications. My numbers: *Parts requests for the Store*, *Parts at or below reorder point*. | Parts requests (approve, reserve, release); exit passes for their department. | The gate registers, money, administration. |
| **Store Officer** | Records goods receipts, matches parts, approves, reserves and releases parts requests. | Same as the Store Manager, without exit-pass authorisation. | Parts requests (approve, reserve, release). | The gate registers, money, administration. |
| **Warranty HOD** | Registers and verifies warranties, approves claims, manages providers and policies. Authorises exit passes for the warranty team. | Dashboard, Approvals, Workshop (read), Inventory (including goods receipts, to trace parts), Warranty, My exit passes, Notifications. My numbers: *Warranties awaiting verification*, *Warranty claims open*. | Warranty verifications and claims, policy and provider removals; exit passes for their department. | The gate, money, administration. |
| **Warranty Officer** | Registers warranties and prepares claims. | Like the Warranty HOD, without Approvals. | Nothing. | The gate, money, administration. |
| **Department Head** | Authorises exit passes for the people in their department. | Dashboard, Approvals, My exit passes (plus Contractors), Scheduling, Notifications. | Exit passes (the Department Head step). | Workshop, Store, Warranty, the gate registers. |
| **Chief Security Officer** | Runs the Security desk and handles incidents. | Dashboard, Approvals, Security (the whole desk), Notifications. My numbers: *Visitors on site*, *Staff out on passes*, *Vehicles on road test*. Activity: all security records in the branch. | Incidents (assigns, closes, reopens). Exit passes only when they are someone's reporting manager. | Workshop, Store, money. |
| **Security Officer** | Works the gate: visitors, vehicles, deliveries, contractors, exit-pass times, incidents. | Dashboard, Security (the whole desk), Notifications. Same My numbers as the Chief. | Nothing. | Workshop records, Store costs, money. |
| **Calendar User** | Keeps their own calendar and books appointments and rooms. | Dashboard, My exit passes, Scheduling, Notifications. My numbers: *My exit passes this month*. | Nothing. | Everything else. |
| **Scheduling Admin** | Manages rooms and aides, books on any calendar. | Dashboard, My exit passes, Scheduling, Notifications. *Today's appointments* counts every calendar. | Nothing. | Everything else. |
| **Broadcaster** | Sends broadcasts to staff and customers. | Dashboard, My exit passes, Notifications (with broadcasts). | Nothing. | Everything else. |
| **Branch Administrator** | Looks after one branch: people and their roles, and oversight of the branch. | Dashboard, Users, Workshop, Customers, Inventory, Warranty, Security, Scheduling, Business Analytics, Notifications — read-only oversight. | Nothing (gives roles). | Organisation set-up for other branches, the audit trail. |
| **Organisation Administrator** | Sets up the organisation for every branch; sees every module read-only, the audit trail and all analytics. | Every module, Administration, Audit Logs. Activity: everything in the organisation. | Nothing (does not approve money or open jobs). | Other organisations. |
| **Master Administrator** (platform team) | The platform owner and support staff. | Everything, in every organisation, plus Approvals (they may decide any step). | Any step. | — |

A person may hold several roles; they get what those roles allow together
(`supermanager@e2e.test` holds Workshop Supervisor and Workshop Manager and
still may not give final approval to an estimate they approved as supervisor).

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

## Known gaps (left as they are)

- Reception holds `security.view`, so the front desk sees the whole Security
  desk, not only visitors. Narrowing it needs a separate reception permission
  for the visitor pages.
- Heads with `security.pass.approve` at department scope can open the
  Contractors list for the whole organisation (department scope is not a
  branch filter there); only the branch Manager can decide a contractor pass.
- The Chief Security Officer holds `security.pass.approve`, but the exit-pass
  head step goes to the requester's reporting manager or a department head
  (`HEAD_SLUGS` in `lib/actions/security.ts`), so in practice the Chief decides
  passes only as someone's reporting manager.
