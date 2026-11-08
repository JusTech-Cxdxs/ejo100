/**
 * The demo role tour: for every demo sign-in (./people.ts), what they see
 * first, three clicks that show their job, and what they must NOT be able to
 * do — plus the 15-minute order for showing the directors. Pure data.
 *
 * docs/KEWALRAM_DEMO.md is generated from this file and ./people.ts
 * (`npm run demo:tour-doc`); tests/demo-tour.test.ts checks every promise
 * here against the authorization catalogue (a "must not" page is refused by
 * the catalogue, a click on a protected page is granted), and
 * e2e/demo-tour.spec.ts signs in as each person and proves it in the browser.
 */
import { DEMO_DOMAIN } from './people';

export type TourLink = { label: string; href: string };
export type TourStop = { firstView: string; clicks: [TourLink, TourLink, TourLink]; mustNot: TourLink[] };

const L = (label: string, href: string): TourLink => ({ label, href });

// Must-not links are protected pages (lib/authz/page-areas.ts) the person's roles do not open.
const NO_USERS = L('manage users', '/users');
const NO_SETTINGS = L('change settings', '/settings');
const NO_AUDIT = L('read the audit trail', '/audit-logs');
const NO_PLANT = L('open the assembly plant', '/plant');
const NO_LINE = L('open the line', '/plant/line');
const NO_JOBS = L('open the job cards', '/workshop/job-cards');
const NO_STORE = L('open the store', '/inventory');
const NO_COSTS = L('see delivery costs and margins', '/inventory/pricing');
const NO_WARRANTY = L('open warranty', '/warranty');
const NO_ANALYTICS = L('open business analytics', '/analytics');
const NO_STRUCTURE = L('change the organisation’s structure', '/structure');

export const TOUR: Record<string, TourStop> = {
  // ── Headquarters ──
  admin: { firstView: 'The dashboard with both branches, the set-up tiles and the day’s audit activity.', clicks: [L('Users and roles of both branches', '/users'), L('Structure: Headquarters, Isolo, Afprint', '/structure'), L('The audit trail', '/audit-logs')], mustNot: [] },
  executive: { firstView: 'The daily brief: job cards open, the bottleneck on the line, money in, claims pending.', clicks: [L('Headquarters: both branches side by side', '/headquarters'), L('The line board at Afprint', '/plant/line'), L('Business analytics', '/analytics')], mustNot: [NO_USERS, NO_SETTINGS] },
  'it.admin': { firstView: 'The IT control room: health, scheduled jobs, sign-in attempts.', clicks: [L('IT control room', '/it'), L('Users', '/users'), L('Data Exchange: the cut-over imports', '/data-exchange')], mustNot: [NO_JOBS, NO_PLANT, NO_WARRANTY] },
  'finance.hq': { firstView: 'Money across both branches: payments, refunds, outside purchases.', clicks: [L('Refunds', '/workshop/refunds'), L('Outside purchases', '/workshop/external-procurement'), L('Delivery costs and margins', '/inventory/pricing')], mustNot: [NO_USERS, NO_LINE] },
  'care.lead': { firstView: 'The Support centre for every branch: open requests, complaints, due times.', clicks: [L('Support centre', '/crm/support'), L('Support analytics', '/crm/support/analytics'), L('Customers', '/crm')], mustNot: [NO_STORE, NO_PLANT] },
  broadcaster: { firstView: 'Broadcasts: what is running, to whom, and who has read it.', clicks: [L('Broadcasts', '/notifications/broadcasts'), L('New broadcast', '/notifications/broadcasts/new'), L('Broadcast analytics', '/notifications/broadcasts/analytics')], mustNot: [NO_JOBS, NO_STORE, NO_USERS] },
  scheduling: { firstView: 'Today’s appointments and the rooms.', clicks: [L('Schedule', '/schedule'), L('Meeting rooms', '/schedule/rooms'), L('Calendar', '/schedule/calendar')], mustNot: [NO_JOBS, NO_STORE] },
  calendar: { firstView: 'His own calendar — and nothing of the workshop.', clicks: [L('My schedule', '/schedule'), L('Calendar', '/schedule/calendar'), L('My profile', '/profile')], mustNot: [NO_JOBS, NO_PLANT, NO_STORE] },

  // ── Isolo ──
  'isolo.admin': { firstView: 'Isolo’s people and the branch at a glance.', clicks: [L('Users at Isolo', '/users'), L('Isolo’s Recycle bin', '/recycle-bin'), L('Isolo’s job cards (read-only)', '/workshop/job-cards')], mustNot: [NO_SETTINGS, NO_STRUCTURE] },
  manager: { firstView: 'Approvals waiting: estimates, closings, parts, outside purchases, exit passes.', clicks: [L('Approvals', '/approvals'), L('Job cards: every status today', '/workshop/job-cards'), L('The service tracker', '/workshop/service-tracker')], mustNot: [NO_USERS, NO_PLANT] },
  'supervisor.passenger': { firstView: 'The passenger workshop’s job cards to accept, assign and check.', clicks: [L('Job cards', '/workshop/job-cards'), L('Vehicle services', '/workshop/vehicle-service'), L('Parts requests', '/workshop/parts-requests')], mustNot: [NO_USERS, NO_PLANT, NO_COSTS] },
  'supervisor.commercial': { firstView: 'The truck bays: Isuzu job cards and fleet customers.', clicks: [L('Job cards', '/workshop/job-cards'), L('Customers', '/workshop/customers'), L('Road tests', '/security/road-tests')], mustNot: [NO_USERS, NO_PLANT, NO_COSTS] },
  'tech.passenger': { firstView: 'His own jobs only, with what to do next on each.', clicks: [L('My job cards', '/workshop/job-cards'), L('My vehicle services', '/workshop/vehicle-service'), L('My profile', '/profile')], mustNot: [NO_PLANT, NO_COSTS, NO_USERS] },
  'tech.commercial': { firstView: 'An Isuzu in rework, a service in progress, an estimate to write.', clicks: [L('My job cards', '/workshop/job-cards'), L('My vehicle services', '/workshop/vehicle-service'), L('Exit passes', '/security/exit-passes')], mustNot: [NO_PLANT, NO_COSTS, NO_AUDIT] },
  frontdesk: { firstView: 'Today’s check-ins, appointments and visitors expected.', clicks: [L('Customers', '/workshop/customers'), L('Book a service', '/workshop/vehicle-service/book'), L('My visitors', '/security/my-visitors')], mustNot: [NO_COSTS, NO_PLANT, NO_USERS] },
  assistant: { firstView: 'Help a colleague: start an assisted session, see who asked for help.', clicks: [L('Assist a colleague', '/support/assist'), L('Get help requests', '/support/help'), L('My profile', '/profile')], mustNot: [NO_JOBS, NO_PLANT, NO_USERS] },
  'store.manager': { firstView: 'The store: stock alerts, pricing alerts, receipts.', clicks: [L('Parts and stock', '/inventory/parts'), L('Pricing alerts', '/inventory/pricing'), L('Goods receipts', '/inventory/goods-receipts')], mustNot: [NO_PLANT, NO_USERS] },
  'store.officer': { firstView: 'Estimates to match and parts requests to approve.', clicks: [L('Estimate matching', '/inventory/estimate-matching'), L('Parts requests', '/workshop/parts-requests'), L('Record a goods receipt', '/inventory/goods-receipts/new')], mustNot: [NO_PLANT, NO_USERS, NO_ANALYTICS] },
  finance: { firstView: 'Isolo’s money: deposits, balances, a refund, outside purchases.', clicks: [L('Refunds', '/workshop/refunds'), L('Outside purchases', '/workshop/external-procurement'), L('Business figures', '/analytics')], mustNot: [NO_USERS, NO_PLANT] },
  'warranty.hod': { firstView: 'Claims at every stage; the one waiting for his approval.', clicks: [L('Warranty claims', '/warranty/claims'), L('Policies', '/warranty/policies'), L('Warranty analytics', '/warranty/analytics')], mustNot: [NO_USERS, NO_SETTINGS] },
  'warranty.officer': { firstView: 'Warranties to register and claims to prepare.', clicks: [L('Warranties', '/warranty'), L('Register a warranty', '/warranty/register'), L('Claims', '/warranty/claims')], mustNot: [NO_USERS, NO_PLANT, NO_ANALYTICS] },
  cso: { firstView: 'The Security desk: overdue items first.', clicks: [L('Overdue', '/security/overdue'), L('Incidents', '/security/incidents'), L('On the premises', '/security/on-premises')], mustNot: [NO_JOBS, NO_USERS, NO_STORE] },
  gate: { firstView: 'The gate: who is expected, who is in, what is going out.', clicks: [L('The register', '/security/register'), L('Visitors', '/security/visitors'), L('Vehicles inside', '/security/vehicles-inside')], mustNot: [NO_JOBS, NO_USERS, NO_STORE] },
  care: { firstView: 'Isolo’s Support centre: the complaint about a scratch, Enyo’s drafts.', clicks: [L('Support centre', '/crm/support'), L('Customers', '/crm'), L('New request', '/crm/support/new')], mustNot: [NO_STORE, NO_PLANT, NO_USERS] },
  'dept.head': { firstView: 'Exit passes waiting for the head of department.', clicks: [L('Exit passes', '/security/exit-passes'), L('Approvals', '/approvals'), L('My profile', '/profile')], mustNot: [NO_USERS, NO_PLANT, NO_STORE] },

  // ── Afprint ──
  'plant.manager': { firstView: 'The plant: vehicles by stage, kits to release, PDIs to approve.', clicks: [L('The plant', '/plant'), L('The line board', '/plant/line'), L('QA audits', '/plant/qa')], mustNot: [NO_JOBS, NO_USERS] },
  production: { firstView: 'The line board: who is at which station, the bottleneck.', clicks: [L('The line board', '/plant/line'), L('Routes', '/plant/routes'), L('Plant vehicles', '/plant/vehicles')], mustNot: [NO_JOBS, NO_USERS, NO_STORE] },
  'operator.1': { firstView: 'His station and the vehicle at it.', clicks: [L('The line', '/plant/line'), L('Plant vehicles', '/plant/vehicles'), L('My profile', '/profile')], mustNot: [NO_JOBS, NO_USERS, NO_STORE] },
  'operator.2': { firstView: 'The cab station on the Isuzu line.', clicks: [L('The line', '/plant/line'), L('Plant vehicles', '/plant/vehicles'), L('My profile', '/profile')], mustNot: [NO_JOBS, NO_USERS, NO_STORE] },
  'operator.3': { firstView: 'The trim station on the S07 line.', clicks: [L('The line', '/plant/line'), L('Plant vehicles', '/plant/vehicles'), L('My profile', '/profile')], mustNot: [NO_JOBS, NO_USERS, NO_STORE] },
  'operator.4': { firstView: 'Wheels, fluids and first start.', clicks: [L('The line', '/plant/line'), L('Plant vehicles', '/plant/vehicles'), L('My profile', '/profile')], mustNot: [NO_JOBS, NO_USERS, NO_STORE] },
  qc: { firstView: 'Tests and the final gate waiting for her.', clicks: [L('The line', '/plant/line'), L('Plant vehicles', '/plant/vehicles'), L('QA audits', '/plant/qa')], mustNot: [NO_JOBS, NO_USERS] },
  quality: { firstView: 'Kits checked by colleagues, waiting to be released.', clicks: [L('Kits', '/plant/kits'), L('Shipments', '/plant/shipments'), L('QA audits', '/plant/qa')], mustNot: [NO_JOBS, NO_USERS] },
  qa: { firstView: 'The daily QA audit: a finished vehicle to re-inspect.', clicks: [L('QA audits', '/plant/qa'), L('Plant vehicles', '/plant/vehicles'), L('The line', '/plant/line')], mustNot: [NO_JOBS, NO_USERS] },
  'kit.inspector.1': { firstView: 'Shipments arriving and kits to check.', clicks: [L('Shipments', '/plant/shipments'), L('Kits', '/plant/kits'), L('Receive a shipment', '/plant/shipments/new')], mustNot: [NO_JOBS, NO_USERS] },
  'kit.inspector.2': { firstView: 'The kit with damage in transit.', clicks: [L('Kits', '/plant/kits'), L('Shipments', '/plant/shipments'), L('My profile', '/profile')], mustNot: [NO_JOBS, NO_USERS] },
  pdi: { firstView: 'Pre-delivery inspections to do on the tablet.', clicks: [L('The plant', '/plant'), L('Plant vehicles', '/plant/vehicles'), L('My profile', '/profile')], mustNot: [NO_JOBS, NO_USERS] },
  'pdi.supervisor': { firstView: 'Colleagues’ PDIs to accept or send back.', clicks: [L('The plant', '/plant'), L('Plant vehicles', '/plant/vehicles'), L('QA audits', '/plant/qa')], mustNot: [NO_JOBS, NO_USERS] },
  'afprint.admin': { firstView: 'The plant’s people and the plant at a glance.', clicks: [L('Users at Afprint', '/users'), L('The plant (read-only)', '/plant'), L('The plant’s Recycle bin', '/recycle-bin')], mustNot: [NO_SETTINGS, NO_STRUCTURE] },
  'kit.store': { firstView: 'The plant’s own store: the parts on the shelf for the line and what came in.', clicks: [L('Parts and stock', '/inventory/parts'), L('Goods receipts', '/inventory/goods-receipts'), L('Record a goods receipt', '/inventory/goods-receipts/new')], mustNot: [NO_USERS, NO_LINE] },
  'plant.gate': { firstView: 'The plant gate: containers in, vehicles out.', clicks: [L('The register', '/security/register'), L('Visitors', '/security/visitors'), L('Vehicles inside', '/security/vehicles-inside')], mustNot: [NO_JOBS, NO_USERS, NO_STORE] },
};

/** The tour stop for a demo sign-in. */
export const tourFor = (email: string): TourStop | undefined => TOUR[email.replace(`@${DEMO_DOMAIN}`, '')];

/** The 15-minute order for the directors: who to sign in as, what to show, in that order. */
export const DIRECTOR_TOUR: { minute: string; as: string; show: string; href: string }[] = [
  { minute: '0–2', as: 'executive', show: 'The daily brief: both branches in one view — job cards open today, the bottleneck on the line, money in, claims pending.', href: '/dashboard' },
  { minute: '2–4', as: 'frontdesk', show: 'A vehicle checked in this morning: the customer, the vehicle’s history from SAP, the job card opened with its 6-digit number.', href: '/workshop/customers' },
  { minute: '4–6', as: 'tech.commercial', show: 'Only his jobs. Open one: the inspection, the estimate he writes, the parts he asks the store for.', href: '/workshop/job-cards' },
  { minute: '6–8', as: 'manager', show: 'Approvals in one place: the estimate (Manager’s final word), a closing, an exit pass. Then the service tracker: who is due, who is overdue.', href: '/approvals' },
  { minute: '8–9', as: 'store.manager', show: 'Stock below reorder, the pricing alert that would have lost money, a receipt with batch and serial numbers.', href: '/inventory/pricing' },
  { minute: '9–10', as: 'warranty.hod', show: 'Nine claims, one at each stage, and the money claimed back from the makers.', href: '/warranty/claims' },
  { minute: '10–12', as: 'production', show: 'Afprint: the line board — every truck at its station, the bottleneck, a defect in rework; then a vehicle’s passport from kit to PDI.', href: '/plant/line' },
  { minute: '12–13', as: 'cso', show: 'Security: the visitor three hours past his time, the exit pass not back yet — what used to be a paper register.', href: '/security/overdue' },
  { minute: '13–14', as: 'customer.adaora', show: 'The customer portal: her S07’s service in progress, the estimate to approve, the next service due.', href: '/customer-portal' },
  { minute: '14–15', as: 'admin', show: 'Control: every action in the audit trail, nothing deleted for good (the Recycle bin), each role only where it belongs.', href: '/audit-logs' },
];
