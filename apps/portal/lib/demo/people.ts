/**
 * The Kewalram demo organisation's people — one sign-in for every role on
 * Headquarters, Isolo Branch (the workshop) and Afprint Assembly Plant — and
 * its four customer-portal sign-ins. Pure data: no database, no secrets.
 *
 *   • Every address ends with @demo.kewalram.local (a reserved name that is
 *     never routed), so a demo account can never be mistaken for, or collide
 *     with, a real colleague, and nothing is ever emailed to it.
 *   • Names are invented. Employee numbers say what they are: DEMO-HQ-001,
 *     DEMO-WS-001 (Isolo workshop), DEMO-AP-001 (the plant) — never the
 *     ORG-BRANCH-NNNN numbers the portal issues to real staff.
 *   • Headquarters people have no branch on their profile: that is what makes
 *     them organisation-wide in the authorization catalogue (lib/authz).
 *   • The plant's people are the same ones the plant demo (lib/plant/demo)
 *     puts on the line, in kit receiving, quality and PDI: `plantKey` ties
 *     each to the demo plan, so loading the plant demo and loading the
 *     sign-ins touch one set of accounts, never two.
 *
 * The passwords come only from the environment (lib/demo/people-load.ts).
 * docs/KEWALRAM_DEMO.md and the tests read this list, so the tour and the
 * accounts can never drift apart.
 */

export const DEMO_DOMAIN = 'demo.kewalram.local';

/** Where a demo person works: Headquarters (no branch), the Isolo workshop, or the Afprint assembly plant. */
export type DemoBranch = 'HQ' | 'ISOLO' | 'AFPRINT';

export type DemoStaff = {
  /** The sign-in: local part @demo.kewalram.local. */
  email: string;
  /** An address this person used to have (the plant demo's first release); a load renames that account instead of making a second one. */
  previousEmail?: string;
  name: string;
  /** The employee number, fixed: DEMO-HQ-001 … */
  employeeId: string;
  /** The role slug (lib/authz/catalogue ROLE_LABELS). */
  role: string;
  /** A second hat the same person wears. */
  alsoRoles?: string[];
  jobTitle: string;
  branch: DemoBranch;
  /** The department slug on that branch (packages/database/prisma/seed.ts); null = none. */
  dept: string | null;
  /** The sign-in of the person they report to. */
  reportsTo?: string;
  /** The plant demo's key for this person (lib/plant/demo/plan.ts DEMO_PEOPLE). */
  plantKey?: string;
  /** For the role tour: what to show when signed in as this person. */
  show: string;
};

const at = (local: string) => `${local}@${DEMO_DOMAIN}`;
const id = (branch: DemoBranch, n: number) => `DEMO-${branch === 'HQ' ? 'HQ' : branch === 'ISOLO' ? 'WS' : 'AP'}-${String(n).padStart(3, '0')}`;

/** The same minimum as the sign-in itself (Better Auth minPasswordLength in lib/auth.ts). */
export const DEMO_PASSWORD_MIN = 8;

// Numbers are fixed per person and never move: a later addition takes the next free number of its branch.
export const DEMO_STAFF: readonly DemoStaff[] = [
  // ── Headquarters: organisation-wide, no branch ──────────────────────────
  { email: at('admin'), name: 'Ngozi Adeyemi-Bakare', employeeId: id('HQ', 1), role: 'administrator', jobTitle: 'Organisation Administrator', branch: 'HQ', dept: null, show: 'Everything, read-only, and the set-up: Structure (both branches), Users and Roles, Settings, Branding, Data Exchange, the Recycle bin and the audit trail. Opens no job, approves no money.' },
  { email: at('executive'), name: 'Olusegun Adebayo', employeeId: id('HQ', 2), role: 'executive', jobTitle: 'Executive Director, Automobile Division', branch: 'HQ', dept: null, show: 'The daily brief, every module and all analytics read-only — the workshop, the store, warranty, the plant and the line. Broadcasts. Approves only what is escalated.' },
  { email: at('it.admin'), name: 'Tobiloba Oyelaran', employeeId: id('HQ', 3), role: 'it-administrator', jobTitle: 'IT Administrator (Group IT)', branch: 'HQ', dept: null, reportsTo: at('executive'), show: 'Users and Roles, Settings, system health, the audit trail and error log, Enyo, Data Exchange imports and exports. No business transaction.' },
  { email: at('finance.hq'), name: 'Kemi Oladipo-Nwachukwu', employeeId: id('HQ', 4), role: 'finance-officer', jobTitle: 'Finance Officer, Headquarters', branch: 'HQ', dept: null, reportsTo: at('executive'), show: 'Every branch’s payments, refunds and outside purchases, read across the organisation. Confirms nothing for a branch she does not belong to — the proof that money stays with the branch.' },
  { email: at('care.lead'), name: 'Blessing Nwosu-Eze', employeeId: id('HQ', 5), role: 'customer-care-lead', jobTitle: 'Customer Care Lead', branch: 'HQ', dept: null, reportsTo: at('executive'), show: 'The Support centre for every branch: requests, complaints, hand-overs and the numbers; customer records.' },
  { email: at('broadcaster'), name: 'Bimbo Akintola', employeeId: id('HQ', 6), role: 'broadcaster', jobTitle: 'Internal Communications Officer', branch: 'HQ', dept: null, reportsTo: at('executive'), show: 'Broadcasts: a notice to all staff, to a branch, or to customers. Nothing else.' },
  { email: at('scheduling'), name: 'Sade Ogunbanjo', employeeId: id('HQ', 7), role: 'scheduling-admin', jobTitle: 'Scheduling Administrator', branch: 'HQ', dept: null, reportsTo: at('executive'), show: 'Meeting rooms and aides; books on anyone’s calendar; the appointment digest.' },
  { email: at('calendar'), name: 'Cornelius Ibeh', employeeId: id('HQ', 8), role: 'calendar-user', jobTitle: 'Executive Assistant', branch: 'HQ', dept: null, reportsTo: at('executive'), show: 'His own calendar and appointments — and nothing of the workshop: the plainest proof of least privilege.' },

  // ── Isolo Branch: the workshop and its store ────────────────────────────
  { email: at('isolo.admin'), name: 'Bolanle Fashola', employeeId: id('ISOLO', 1), role: 'branch-administrator', jobTitle: 'Branch Administrator, Isolo', branch: 'ISOLO', dept: null, reportsTo: at('admin'), show: 'Isolo’s people and roles, and the branch read-only. Cannot see the plant, cannot touch Headquarters’ set-up.' },
  { email: at('manager'), name: 'Emeka Okonkwo', employeeId: id('ISOLO', 2), role: 'workshop-manager', jobTitle: 'Branch Manager, Isolo', branch: 'ISOLO', dept: null, reportsTo: at('executive'), show: 'Approvals: estimates (final), closing and cancelling jobs, parts requests, outside purchases, warranty claims, exit passes, road tests. Branch analytics.' },
  { email: at('supervisor.passenger'), name: 'Ifeoma Chukwuma', employeeId: id('ISOLO', 3), role: 'workshop-supervisor', jobTitle: 'Workshop Supervisor, Passenger Vehicles', branch: 'ISOLO', dept: 'workshop-passenger', reportsTo: at('manager'), show: 'The passenger workshop’s job cards: accept, assign the technician, check the estimate, mark ready for collection.' },
  { email: at('supervisor.commercial'), name: 'Abdulrahman Danjuma', employeeId: id('ISOLO', 4), role: 'workshop-supervisor', jobTitle: 'Workshop Supervisor, Commercial Vehicles', branch: 'ISOLO', dept: 'workshop-commercial', reportsTo: at('manager'), show: 'The truck bays: Isuzu job cards, the fleet customers, parts requests on their estimates.' },
  { email: at('tech.passenger'), name: 'Tunde Adesanya', employeeId: id('ISOLO', 5), role: 'technician', jobTitle: 'Technician, Passenger Vehicles', branch: 'ISOLO', dept: 'workshop-passenger', reportsTo: at('supervisor.passenger'), show: 'The jobs assigned to him: accept, inspect, write the estimate, raise the parts request. Sees nobody else’s job.' },
  { email: at('tech.commercial'), name: 'Kabiru Yusuf', employeeId: id('ISOLO', 6), role: 'technician', jobTitle: 'Technician, Commercial Vehicles', branch: 'ISOLO', dept: 'workshop-commercial', reportsTo: at('supervisor.commercial'), show: 'An Isuzu NQR in rework and a service in progress; the estimate he is writing.' },
  { email: at('frontdesk'), name: 'Funmilayo Adebisi', employeeId: id('ISOLO', 7), role: 'receptionist', jobTitle: 'Front Desk Officer', branch: 'ISOLO', dept: null, reportsTo: at('manager'), show: 'Customers and vehicles, opening a job card or a vehicle service, today’s appointments, visitors expected.' },
  { email: at('assistant'), name: 'Adaobi Nnamdi', employeeId: id('ISOLO', 8), role: 'branch-assistant', jobTitle: 'Branch Assistant (IT support)', branch: 'ISOLO', dept: null, reportsTo: at('isolo.admin'), show: 'Helps a colleague on their behalf with the colleague’s own password; every action recorded as done for them. Cannot help the Manager or Finance.' },
  { email: at('store.manager'), name: 'Stella Oyinlola', employeeId: id('ISOLO', 9), role: 'store-manager', jobTitle: 'Store Manager', branch: 'ISOLO', dept: 'store', reportsTo: at('manager'), show: 'The store: stock, pricing alerts, goods receipts, suppliers, releasing parts; the stock alerts.' },
  { email: at('store.officer'), name: 'Obinna Madu', employeeId: id('ISOLO', 10), role: 'store-officer', jobTitle: 'Store Officer', branch: 'ISOLO', dept: 'store', reportsTo: at('store.manager'), show: 'Matching estimate parts to stock, approving and reserving parts requests, recording a goods receipt (batch and serial).' },
  { email: at('finance'), name: 'Femi Ajayi', employeeId: id('ISOLO', 11), role: 'finance-officer', jobTitle: 'Finance Officer, Isolo', branch: 'ISOLO', dept: null, reportsTo: at('manager'), show: 'Payments and deposits on job cards, a refund, outside-purchase review, Finance sign-off on an import.' },
  { email: at('warranty.hod'), name: 'Wale Oguntade', employeeId: id('ISOLO', 12), role: 'warranty-hod', jobTitle: 'Head of Warranty', branch: 'ISOLO', dept: null, reportsTo: at('manager'), show: 'Warranty claims at every stage, providers and policies, the claim waiting for his approval.' },
  { email: at('warranty.officer'), name: 'Wuraola Balogun', employeeId: id('ISOLO', 13), role: 'warranty-officer', jobTitle: 'Warranty Officer', branch: 'ISOLO', dept: null, reportsTo: at('warranty.hod'), show: 'Registering a warranty, preparing a claim with its evidence — never approving one.' },
  { email: at('cso'), name: 'Musa Garba', employeeId: id('ISOLO', 14), role: 'chief-security-officer', jobTitle: 'Chief Security Officer', branch: 'ISOLO', dept: null, reportsTo: at('manager'), show: 'The Security desk: visitors, vehicles, exit passes, road tests, the overdue item on his list, incidents.' },
  { email: at('gate'), name: 'Sunday Okon', employeeId: id('ISOLO', 15), role: 'security-officer', jobTitle: 'Security Officer, Main Gate', branch: 'ISOLO', dept: null, reportsTo: at('cso'), show: 'The gate: sign a visitor in, a vehicle out on its exit pass, a road test back in.' },
  { email: at('care'), name: 'Chidinma Okafor', employeeId: id('ISOLO', 16), role: 'customer-care', jobTitle: 'Customer Care Officer, Isolo', branch: 'ISOLO', dept: null, reportsTo: at('care.lead'), show: 'Isolo’s Support centre: open requests, the complaint, Enyo’s draft reply, the customer’s jobs and warranties to answer from.' },
  { email: at('dept.head'), name: 'Dayo Olawale', employeeId: id('ISOLO', 17), role: 'department-head', jobTitle: 'Head of Department, Commercial Vehicles', branch: 'ISOLO', dept: 'workshop-commercial', reportsTo: at('manager'), show: 'Authorises his department’s exit passes before the Manager approves them — and nothing else.' },

  // ── Afprint Assembly Plant ──────────────────────────────────────────────
  // The plant demo (lib/plant/demo/plan.ts) puts these people on the line by plantKey; the numbers 001–013 are the ones its first release used.
  { email: at('plant.manager'), previousEmail: 'adaeze.okafor@afprint-demo.example', name: 'Adaeze Okafor', employeeId: id('AFPRINT', 1), role: 'plant-manager', jobTitle: 'Plant Manager', branch: 'AFPRINT', dept: 'plant-production', reportsTo: at('executive'), plantKey: 'pm', show: 'The plant: every vehicle from kit to yard, kits to release, PDIs to approve, the line board, the figures.' },
  { email: at('production'), previousEmail: 'musa.bello@afprint-demo.example', name: 'Musa Bello', employeeId: id('AFPRINT', 2), role: 'production-supervisor', jobTitle: 'Production Supervisor', branch: 'AFPRINT', dept: 'plant-production', reportsTo: at('plant.manager'), plantKey: 'prod', show: 'The line board: vehicles at their stations, the bottleneck, defects in rework, the routes he edits.' },
  { email: at('operator.1'), previousEmail: 'chinedu.eze@afprint-demo.example', name: 'Chinedu Eze', employeeId: id('AFPRINT', 3), role: 'line-operator', jobTitle: 'Line Operator, Chassis', branch: 'AFPRINT', dept: 'plant-production', reportsTo: at('production'), plantKey: 'op1', show: 'His station: the checks, a torque reading against its limits, a defect raised. Cannot pass the gate.' },
  { email: at('operator.2'), previousEmail: 'gbenga.ogunleye@afprint-demo.example', name: 'Gbenga Ogunleye', employeeId: id('AFPRINT', 4), role: 'line-operator', jobTitle: 'Line Operator, Cab', branch: 'AFPRINT', dept: 'plant-production', reportsTo: at('production'), plantKey: 'op2', show: 'The cab station on the Isuzu line.' },
  { email: at('operator.3'), previousEmail: 'ifeanyi.nwosu@afprint-demo.example', name: 'Ifeanyi Nwosu', employeeId: id('AFPRINT', 5), role: 'line-operator', jobTitle: 'Line Operator, Trim', branch: 'AFPRINT', dept: 'plant-production', reportsTo: at('production'), plantKey: 'op3', show: 'The trim station on the S07 line.' },
  { email: at('operator.4'), previousEmail: 'sadiq.abubakar@afprint-demo.example', name: 'Sadiq Abubakar', employeeId: id('AFPRINT', 6), role: 'line-operator', jobTitle: 'Line Operator, Final', branch: 'AFPRINT', dept: 'plant-production', reportsTo: at('production'), plantKey: 'op4', show: 'Wheels, fluids and first start.' },
  { email: at('qc'), previousEmail: 'funke.adeyemi@afprint-demo.example', name: 'Funke Adeyemi', employeeId: id('AFPRINT', 7), role: 'qc-inspector', jobTitle: 'QC Inspector', branch: 'AFPRINT', dept: 'plant-quality', reportsTo: at('quality'), plantKey: 'qc', show: 'End-of-line tests, the road test, the final gate, verifying reworked defects — never a check she recorded herself.' },
  { email: at('quality'), previousEmail: 'ngozi.okonkwo@afprint-demo.example', name: 'Ngozi Okonkwo', employeeId: id('AFPRINT', 8), role: 'quality-supervisor', jobTitle: 'Quality Supervisor', branch: 'AFPRINT', dept: 'plant-quality', reportsTo: at('plant.manager'), plantKey: 'qs', show: 'Kits checked by colleagues to release, hold or reject (never her own); shortages and damage to supplier claims.' },
  { email: at('qa'), previousEmail: 'halima.ibrahim@afprint-demo.example', name: 'Halima Ibrahim', employeeId: id('AFPRINT', 9), role: 'qa-auditor', jobTitle: 'QA Auditor', branch: 'AFPRINT', dept: 'plant-quality', reportsTo: at('quality'), plantKey: 'qa', show: 'The daily QA audit: a finished vehicle re-inspected and scored; the one that failed and went back to rework.' },
  { email: at('kit.inspector.1'), previousEmail: 'kelechi.balogun@afprint-demo.example', name: 'Kelechi Balogun', employeeId: id('AFPRINT', 10), role: 'kit-inspector', jobTitle: 'Kit Inspector', branch: 'AFPRINT', dept: 'plant-kit-receiving', reportsTo: at('quality'), plantKey: 'kit1', show: 'A shipment arriving: open each kit, check it against the packing list, raise a shortage.' },
  { email: at('kit.inspector.2'), previousEmail: 'damilola.adebayo@afprint-demo.example', name: 'Damilola Adebayo', employeeId: id('AFPRINT', 11), role: 'kit-inspector', jobTitle: 'Kit Inspector', branch: 'AFPRINT', dept: 'plant-kit-receiving', reportsTo: at('quality'), plantKey: 'kit2', show: 'The second inspector: the kit with damage in transit.' },
  { email: at('pdi'), previousEmail: 'rotimi.yusuf@afprint-demo.example', name: 'Rotimi Yusuf', employeeId: id('AFPRINT', 12), role: 'pdi-inspector', jobTitle: 'PDI Inspector', branch: 'AFPRINT', dept: 'plant-pdi', reportsTo: at('pdi.supervisor'), plantKey: 'pdi1', show: 'A pre-delivery inspection on the tablet: the checklist, the scan, the readings, the label.' },
  { email: at('pdi.supervisor'), previousEmail: 'temitope.okoro@afprint-demo.example', name: 'Temitope Okoro', employeeId: id('AFPRINT', 13), role: 'pdi-supervisor', jobTitle: 'PDI Supervisor', branch: 'AFPRINT', dept: 'plant-pdi', reportsTo: at('plant.manager'), plantKey: 'pdi2', show: 'Colleagues’ PDIs to accept or reject back to rework — never her own.' },
  { email: at('afprint.admin'), name: 'Yetunde Alabi-Lawal', employeeId: id('AFPRINT', 14), role: 'branch-administrator', jobTitle: 'Branch Administrator, Afprint', branch: 'AFPRINT', dept: null, reportsTo: at('admin'), show: 'The plant’s people and roles, and the plant read-only. Cannot see Isolo’s job cards.' },
  { email: at('kit.store'), name: 'Uchenna Obi', employeeId: id('AFPRINT', 15), role: 'kit-inspector', jobTitle: 'Kit Store Keeper', branch: 'AFPRINT', dept: 'plant-kit-receiving', reportsTo: at('plant.manager'), show: 'The kit store: each shipment’s cases received against its kits, counted and checked before release to the line.' },
  { email: at('plant.gate'), name: 'Ibrahim Shehu', employeeId: id('AFPRINT', 16), role: 'security-officer', jobTitle: 'Security Officer, Plant Gate', branch: 'AFPRINT', dept: null, reportsTo: at('cso'), show: 'The plant gate: containers in, a finished vehicle out to Isolo on its pass, the road test back.' },
];

export type DemoCustomerKind = 'INDIVIDUAL' | 'FLEET' | 'WARRANTY' | 'PLANT';

export type DemoCustomer = {
  email: string;
  kind: DemoCustomerKind;
  name: string;
  /** Set for a company (a fleet). */
  company?: string;
  phone: string;
  address: string;
  show: string;
};

/**
 * Customer-portal sign-ins. The customers themselves are created with the
 * sign-ins (so the portal can be shown before the workshop demo is loaded);
 * their vehicles, job cards, warranties and claims come with the workshop
 * demo, which finds them by these addresses.
 */
export const DEMO_CUSTOMERS: readonly DemoCustomer[] = [
  { email: at('customer.adaora'), kind: 'INDIVIDUAL', name: 'Adaora Chukwu', phone: '0800 000 0101', address: '14 Oshodi–Apapa Expressway, Isolo, Lagos', show: 'Her Soueast S07: the service in progress, the estimate to approve, her service history and the next service due.' },
  { email: at('customer.fleet'), kind: 'FLEET', name: 'Dangiwa Haulage Limited', company: 'Dangiwa Haulage Limited', phone: '0800 000 0102', address: 'Plot 7, Ikeja Industrial Estate, Lagos', show: 'A fleet of Isuzu trucks: the job cards open today, an invoice to pay, the vehicle due for its 40,000 km service.' },
  { email: at('customer.warranty'), kind: 'WARRANTY', name: 'Chukwuemeka Nwankwo', phone: '0800 000 0103', address: '3 Allen Avenue, Ikeja, Lagos', show: 'His warranty and the claim under review — where it stands, what Kewalram asked for.' },
  { email: at('customer.afprint'), kind: 'PLANT', name: 'Halima Abdullahi', phone: '0800 000 0104', address: '22 Adeniran Ogunsanya Street, Surulere, Lagos', show: 'A vehicle built at Afprint: its passport from kit to PDI certificate, and its first service at Isolo.' },
];

/** The plant demo's people (lib/plant/demo/plan.ts), in plan order. */
export const PLANT_DEMO_STAFF = DEMO_STAFF.filter((s) => s.plantKey);

export const isDemoEmail = (email: string | null | undefined): boolean => String(email ?? '').toLowerCase().endsWith(`@${DEMO_DOMAIN}`);

/** The person for a role, or the first in a branch holding it (the tour and the tests). */
export function demoPerson(role: string, branch?: DemoBranch): DemoStaff {
  const p = DEMO_STAFF.find((s) => s.role === role && (!branch || s.branch === branch)) ?? DEMO_STAFF.find((s) => s.role === role);
  if (!p) throw new Error(`No demo person holds the role ${role}.`);
  return p;
}
