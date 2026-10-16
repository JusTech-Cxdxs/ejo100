/**
 * EJO 100 Authorization Catalogue.
 *
 * The one definition of what can be done in EJO 100, and the default grants
 * per role. Model: User → Role → Permission → Scope → Record → State → Action.
 *
 *  • Permissions are defined here, in reviewed code: a permission needs code
 *    that enforces it. Organisations can add grants in the database
 *    (RolePermission), but only for permissions defined here.
 *  • Scope says which records: ALL · BRANCH · DEPARTMENT · ASSIGNED · OWN.
 *  • `decide()` is a pure function used everywhere (pages, actions, search,
 *    exports, notifications, realtime, analytics), tested with allowed and
 *    denied cases.
 *  • State rules (who may move a record to its next stage) stay in each
 *    workflow action, which checks the current status atomically.
 */
export type Scope = 'ALL' | 'BRANCH' | 'DEPARTMENT' | 'ASSIGNED' | 'OWN';
const RANK: Record<Scope, number> = { OWN: 1, ASSIGNED: 2, DEPARTMENT: 3, BRANCH: 4, ALL: 5 };

export const PERMISSIONS = {
  // Administration
  'admin.organisation.manage': { module: 'Administration', label: 'Manage the organisation profile' },
  'admin.structure.manage': { module: 'Administration', label: 'Manage business units, locations, branches, departments and teams' },
  'admin.users.manage': { module: 'Administration', label: 'Manage people and give them roles' },
  'admin.roles.manage': { module: 'Administration', label: 'Manage roles and permissions' },
  'admin.settings.manage': { module: 'Administration', label: 'Manage settings, branding and modules' },
  'audit.view': { module: 'Administration', label: 'View the full audit trail' },
  'admin.recycle_bin.manage': { module: 'Administration', label: 'Open the Recycle bin, restore records deleted by mistake, and delete such records' },
  'enyo.manage': { module: 'Administration', label: 'Manage Enyo (AI): switch features on or off, see what it is learning and how accurate it is' },
  'integrity.review': { module: 'Administration', label: 'Review integrity alerts (unusual money, parts, warranty, gate and sign-in activity) and Speak up reports — never alerts about themselves' },
  // Analytics
  'analytics.business.view': { module: 'Analytics', label: 'View Business Analytics (sales, cost, profit, cash)' },
  'analytics.inventory.view': { module: 'Analytics', label: 'View Inventory Analytics' },
  'analytics.warranty.view': { module: 'Analytics', label: 'View Warranty Analytics' },
  // Workshop
  'workshop.view': { module: 'Workshop', label: 'Open the Workshop' },
  'workshop.job_card.view': { module: 'Workshop', label: 'View Job Cards and Vehicle Services' },
  'workshop.job_card.create': { module: 'Workshop', label: 'Open Job Cards and Vehicle Services (front desk)' },
  'workshop.customer.manage': { module: 'Workshop', label: 'Register customers and vehicles (front desk)' },
  'workshop.job.supervise': { module: 'Workshop', label: 'Accept or turn down supervising a job — as its assigned supervisor' },
  'workshop.estimate.approve': { module: 'Workshop', label: 'Approve estimates — as the assigned supervisor of the job' },
  'workshop.estimate.final_approve': { module: 'Workshop', label: 'Give final approval to estimates (Manager)' },
  'workshop.close.approve': { module: 'Workshop', label: 'Approve closing and cancelling jobs (Manager)' },
  'workshop.customer.notify': { module: 'Workshop', label: 'Notify customers of approved estimates and send reminders (front desk)' },
  'workshop.technician.assign': { module: 'Workshop', label: 'Assign technicians — on jobs they supervise' },
  'workshop.inspection.perform': { module: 'Workshop', label: 'Carry out vehicle inspections — on jobs assigned to them' },
  'workshop.estimate.edit': { module: 'Workshop', label: 'Prepare and submit estimates — on jobs assigned to them' },
  'workshop.job.work': { module: 'Workshop', label: 'Accept and carry out work — on jobs assigned to them' },
  'workshop.close.request': { module: 'Workshop', label: 'Request closing or cancellation — of jobs they opened (front desk) or supervise' },
  'store.prs.approve_hod': { module: 'Workshop', label: 'Parts requests — first approval, before the Store (Manager)' },
  'workshop.payment.record': { module: 'Finance', label: 'Record payments' },
  // Customers (CRM)
  'crm.view': { module: 'Customers', label: 'See customers, their 360 pages, spend and history' },
  'crm.manage': { module: 'Customers', label: 'Edit customers, their contacts, addresses, notes, tags and portal access' },
  'support.tickets.manage': { module: 'Customers', label: 'Work the Support centre: answer support requests (email, chat hand-overs, calls) and see its numbers for their branch' },
  'support.manage': { module: 'Customers', label: 'Set up the Support centre: teams and their email addresses, who works them, opening hours, targets and how Enyo answers' },
  'workshop.refund.record': { module: 'Finance', label: 'Record refunds' },
  // Store & procurement
  'store.view': { module: 'Store', label: 'Open the Store — parts, stock, parts requests and outside purchases' },
  'store.parts.manage': { module: 'Store', label: 'Manage parts, prices, stock levels and pricing alerts' },
  'store.matching': { module: 'Store', label: 'Match estimate parts to items in stock' },
  'sourcing.request': { module: 'Store', label: 'Raise parts requests and outside purchases — on jobs assigned to them' },
  'store.grn.record': { module: 'Store', label: 'Record goods receipts' },
  'store.prs.release': { module: 'Store', label: 'Parts requests — approve, reserve and release (Store)' },
  'procurement.epr.review': { module: 'Procurement', label: 'Outside purchases — review (Finance)' },
  'procurement.epr.approve': { module: 'Procurement', label: 'Outside purchases — approve (Manager)' },
  'procurement.epr.disburse': { module: 'Procurement', label: 'Outside purchases — pay out the cash (Finance)' },
  // Warranty
  'warranty.view': { module: 'Warranty', label: 'View warranties and claims' },
  'warranty.manage': { module: 'Warranty', label: 'Register warranties and prepare claims' },
  'warranty.claim.approve': { module: 'Warranty', label: 'Approve warranty claims, decide who pays for estimate lines, and manage providers and policies' },
  // Security
  'security.exit_pass.request': { module: 'Security', label: 'Request an exit pass for themselves (every employee)' },
  'security.view': { module: 'Security', label: 'Open the Security desk — visitors, vehicles, passes and the gate log' },
  'security.gate.operate': { module: 'Security', label: 'Operate the gate — visitors, vehicles and passes in and out' },
  'security.reception.operate': { module: 'Security', label: 'Receive visitors at reception' },
  'security.pass.approve': { module: 'Security', label: 'Approve exit passes, road tests and contractor passes (heads of department and the branch manager)' },
  'security.incident.manage': { module: 'Security', label: 'Assign, close and reopen incidents' },
  // Scheduling & notifications
  'schedule.view': { module: 'Scheduling', label: 'Keep a calendar and book appointments (own calendar, or as an aide)' },
  'schedule.manage': { module: 'Scheduling', label: 'Manage meeting rooms and aides, and book on any calendar' },
  'notifications.broadcast.send': { module: 'Notifications', label: 'Send broadcasts' },
  // Support
  'support.assist': { module: 'Support', label: 'Help colleagues with their tasks (assisted session)' },
} as const;
export type PermissionKey = keyof typeof PERMISSIONS;

/**
 * Everyone signed in: only requesting their own exit pass. Everything else
 * comes from the roles a person holds (the widest grant wins). Approvals the
 * workflow routes to a person (e.g. the requester's reporting manager on an
 * exit pass) are decided by that workflow, not by this list.
 */
const BASELINE: Partial<Record<PermissionKey, Scope>> = {
  'security.exit_pass.request': 'OWN',
};

const B = 'BRANCH' as const;
const A = 'ALL' as const;
/** Assignment-based: only on the job where they are the assigned supervisor / technician (or, for front desk, the job they opened). */
const MINE = 'ASSIGNED' as const;
/** Read-only view of a module, in their branch. */
const VIEW_WORKSHOP = { 'workshop.view': B, 'workshop.job_card.view': B } as const;

/**
 * Default grants per role — modelled on how a dealership workshop actually
 * runs (segregation of duties, as in SAP): each department does its own
 * work and sees what that work needs, nothing else. Organisations can ADD
 * grants on the Roles page; these defaults are reviewed code.
 */
export const ROLE_GRANTS: Record<string, Partial<Record<PermissionKey, Scope>>> = {
  // ── Administration ───────────────────────────────────────────────
  // Headquarters: runs the organisation's set-up across every branch and
  // oversees everything (read-only) — but does not do the departments'
  // transactions (no opening jobs, approving money or recording payments).
  administrator: {
    'admin.organisation.manage': A, 'admin.structure.manage': A, 'admin.users.manage': A, 'admin.roles.manage': A, 'admin.settings.manage': A,
    'audit.view': A, 'analytics.business.view': A, 'analytics.inventory.view': A, 'analytics.warranty.view': A, 'notifications.broadcast.send': A,
    'workshop.view': A, 'workshop.job_card.view': A, 'store.view': A, 'warranty.view': A, 'security.view': A, 'schedule.view': 'OWN',
    'crm.view': A, 'crm.manage': A, 'admin.recycle_bin.manage': A, 'enyo.manage': A, 'support.tickets.manage': A, 'support.manage': A, 'integrity.review': A,
  },
  // One branch: its people and their roles, and oversight of that branch.
  'branch-administrator': {
    'admin.users.manage': B, ...VIEW_WORKSHOP, 'store.view': B, 'warranty.view': B, 'security.view': B,
    'analytics.business.view': B, 'analytics.inventory.view': B, 'analytics.warranty.view': B, 'schedule.view': 'OWN',
    'crm.view': B, 'crm.manage': B, 'admin.recycle_bin.manage': B, 'support.tickets.manage': B,
  },
  // ── Workshop ─────────────────────────────────────────────────────
  // Front desk: the customer relationship — customers, vehicles, opening
  // Job Cards and Vehicle Services, telling customers, receiving visitors.
  receptionist: {
    ...VIEW_WORKSHOP, 'workshop.job_card.create': B, 'workshop.customer.manage': B, 'workshop.customer.notify': B, 'workshop.close.request': MINE,
    'crm.view': B, 'crm.manage': B, 'support.tickets.manage': B,
    'security.view': B, 'security.reception.operate': B, 'schedule.view': 'OWN',
  },
  // Accepts the job, assigns the technician, prepares and APPROVES the estimate.
  'workshop-supervisor': {
    ...VIEW_WORKSHOP, 'store.view': B, 'crm.view': B,
    'workshop.job.supervise': MINE, 'workshop.technician.assign': MINE, 'workshop.estimate.edit': MINE, 'workshop.estimate.approve': MINE,
    'workshop.inspection.perform': MINE, 'workshop.job.work': MINE, 'workshop.close.request': MINE, 'sourcing.request': MINE,
  },
  // Accepts or turns down the job, inspects, works, writes the estimate — cannot approve it.
  technician: {
    ...VIEW_WORKSHOP, 'store.view': B,
    'workshop.job.work': MINE, 'workshop.estimate.edit': MINE, 'workshop.inspection.perform': MINE, 'sourcing.request': MINE,
  },
  // Approves and closes — never opens jobs.
  // Approves for the branch (passes, road tests, contractors included) but does
  // not run the gate: no Security desk registers.
  'workshop-manager': {
    ...VIEW_WORKSHOP, 'store.view': B, 'warranty.view': B,
    'workshop.estimate.final_approve': B, 'workshop.close.approve': B, 'store.prs.approve_hod': B, 'procurement.epr.approve': B,
    'warranty.manage': B, 'warranty.claim.approve': B, 'security.pass.approve': B,
    'analytics.business.view': B, 'analytics.inventory.view': B, 'analytics.warranty.view': B, 'schedule.view': 'OWN',
    'crm.view': B, 'crm.manage': B, 'support.tickets.manage': B,
  },
  // ── Finance ──────────────────────────────────────────────────────
  // Money only: payments, refunds, outside-purchase review and cash.
  'finance-officer': {
    ...VIEW_WORKSHOP, 'store.view': B,
    'workshop.payment.record': B, 'workshop.refund.record': B, 'procurement.epr.review': B, 'procurement.epr.disburse': B,
    'analytics.business.view': B, 'analytics.inventory.view': B,
  },
  // ── Store ────────────────────────────────────────────────────────
  'store-manager': {
    'store.view': B, ...VIEW_WORKSHOP, 'store.matching': B, 'store.parts.manage': B, 'store.grn.record': B, 'store.prs.release': B,
    'analytics.inventory.view': B, 'security.pass.approve': 'DEPARTMENT',
  },
  'store-officer': { 'store.view': B, ...VIEW_WORKSHOP, 'store.matching': B, 'store.parts.manage': B, 'store.grn.record': B, 'store.prs.release': B, 'analytics.inventory.view': B },
  // ── Warranty ─────────────────────────────────────────────────────
  // Warranty sets part warranties and follows parts back to their receipts — read-only Store.
  'warranty-hod': { 'warranty.view': B, ...VIEW_WORKSHOP, 'store.view': B, 'warranty.manage': B, 'warranty.claim.approve': B, 'analytics.warranty.view': B, 'security.pass.approve': 'DEPARTMENT' },
  'warranty-officer': { 'warranty.view': B, ...VIEW_WORKSHOP, 'store.view': B, 'warranty.manage': B, 'analytics.warranty.view': B },
  // ── People & security ────────────────────────────────────────────
  'department-head': { 'security.pass.approve': 'DEPARTMENT', 'schedule.view': 'OWN' },
  'chief-security-officer': { 'security.view': B, 'security.gate.operate': B, 'security.reception.operate': B, 'security.incident.manage': B, 'security.pass.approve': 'DEPARTMENT' },
  'security-officer': { 'security.view': B, 'security.gate.operate': B, 'security.reception.operate': B },
  // ── Scheduling & communication ───────────────────────────────────
  'calendar-user': { 'schedule.view': 'OWN' },
  'scheduling-admin': { 'schedule.view': A, 'schedule.manage': A },
  broadcaster: { 'notifications.broadcast.send': A },
  // ── Support ──────────────────────────────────────────────────────
  // Sits with a colleague who is not at ease with computers and works on
  // their behalf, with their password as consent. Nothing else: while
  // assisting, what can be done is exactly what the colleague can do.
  'branch-assistant': { 'support.assist': B },
};

/** Steps only the platform team may take — never grantable to organisation roles. */
export const PLATFORM_ONLY: string[] = [
  'Permanently remove items from the Recycle bin before their time runs out',
  "Change a job's supervisor after it has been set",
  'Override a Job Card status directly',
  'Change the organisation-wide service interval',
];

/** orgBranchIds: the branches of the person's OWN organisation — the tenant
 * fence. No scope (not even ALL) reaches a record in another organisation's
 * branch. Absent for the platform team (and for an account not yet placed
 * in an organisation, which sees nothing of substance anyway). */
export type Principal = { userId: string; isSuperAdmin: boolean; roleSlugs: string[]; branchId: string | null; departmentId: string | null; organisationId?: string | null; orgBranchIds?: string[]; extraGrants?: Partial<Record<PermissionKey, Scope>> };
/** homeBranch: for approvals and money — a branch-scoped person must BELONG to
 * the record's branch (someone with no branch on their profile is refused,
 * not treated as organisation-wide). */
export type RecordContext = { branchId?: string | null; departmentId?: string | null; ownerIds?: (string | null | undefined)[]; assigneeIds?: (string | null | undefined)[]; homeBranch?: boolean };
export type Decision = { allowed: boolean; scope: Scope | null; reason: string };

/** The widest scope this person holds for a permission (null = none). */
export function scopeFor(p: Principal, key: PermissionKey): Scope | null {
  if (p.isSuperAdmin) return 'ALL';
  let best: Scope | null = BASELINE[key] ?? null;
  const consider = (s?: Scope) => { if (s && (!best || RANK[s] > RANK[best])) best = s; };
  for (const slug of p.roleSlugs) consider(ROLE_GRANTS[slug]?.[key]);
  consider(p.extraGrants?.[key]);
  return best;
}

/** Allow or deny, with the reason — the single rule used everywhere. */
export function decide(p: Principal, key: PermissionKey, record?: RecordContext): Decision {
  if (!(key in PERMISSIONS)) return { allowed: false, scope: null, reason: `Unknown permission ${key}` };
  const scope = scopeFor(p, key);
  if (!scope) return { allowed: false, scope: null, reason: 'No role grants this permission' };
  // Tenant fence — before any scope, ALL included.
  if (record?.branchId && !p.isSuperAdmin && p.orgBranchIds && !p.orgBranchIds.includes(record.branchId)) {
    return { allowed: false, scope, reason: 'Outside your organisation' };
  }
  if (!record || scope === 'ALL') return { allowed: true, scope, reason: scope === 'ALL' ? 'Granted for everything' : 'Granted' };
  const me = p.userId;
  const owns = (record.ownerIds ?? []).includes(me);
  const assigned = owns || (record.assigneeIds ?? []).includes(me);
  // A person with no branch on their profile is not limited to one branch (organisation-wide staff).
  const inBranch = record.homeBranch ? Boolean(p.branchId) && (!record.branchId || record.branchId === p.branchId) : !p.branchId || !record.branchId || record.branchId === p.branchId;
  const inDept = !p.departmentId || !record.departmentId ? inBranch : record.departmentId === p.departmentId;
  const ok = scope === 'BRANCH' ? inBranch : scope === 'DEPARTMENT' ? inDept : scope === 'ASSIGNED' ? assigned : owns;
  return ok ? { allowed: true, scope, reason: `Within ${scope.toLowerCase()} scope` } : { allowed: false, scope, reason: `Outside ${scope.toLowerCase()} scope` };
}

/** Which permission each protected area of the portal needs. */
export const PAGE_PERMISSIONS: Record<string, PermissionKey> = {
  organisation: 'admin.organisation.manage', structure: 'admin.structure.manage', 'business-units': 'admin.structure.manage', countries: 'admin.structure.manage', states: 'admin.structure.manage',
  cities: 'admin.structure.manage', branches: 'admin.structure.manage', departments: 'admin.structure.manage', teams: 'admin.structure.manage',
  users: 'admin.users.manage', roles: 'admin.roles.manage', permissions: 'admin.roles.manage', settings: 'admin.settings.manage', branding: 'admin.settings.manage',
  'module-registry': 'admin.settings.manage', 'audit-logs': 'audit.view', 'recycle-bin': 'admin.recycle_bin.manage', analytics: 'analytics.business.view', crm: 'crm.view',
  integrity: 'integrity.review',
};

/** How each role is named to people. */
export const ROLE_LABELS: Record<string, string> = {
  administrator: 'Organisation Administrator (headquarters)', 'branch-administrator': 'Branch Administrator', 'workshop-manager': 'Workshop Manager', 'workshop-supervisor': 'Workshop Supervisor', technician: 'Technician',
  'finance-officer': 'Finance Officer', 'store-manager': 'Store Manager', 'store-officer': 'Store Officer', 'warranty-hod': 'Warranty HOD',
  'warranty-officer': 'Warranty Officer', 'department-head': 'Department Head', 'chief-security-officer': 'Chief Security Officer',
  'security-officer': 'Security Officer', receptionist: 'Front Desk (Receptionist)', 'calendar-user': 'Calendar User', 'scheduling-admin': 'Scheduling Admin', broadcaster: 'Broadcaster',
  'branch-assistant': 'Branch Assistant (IT support)',
};

/**
 * What each role is for, in plain words — shown on the Roles page so an
 * administrator understands a role before giving it to someone.
 */
export const ROLE_DESCRIPTIONS: Record<string, string> = {
  administrator: 'Sets up the organisation for every branch: people, roles, structure, settings and branding. Sees every module read-only, the audit trail and all analytics. Does not open jobs, approve money or record payments.',
  'branch-administrator': 'Looks after one branch: adds people and gives them roles, and keeps an eye on the branch (workshop, store, warranty, security and analytics) without doing the departments\' work.',
  receptionist: 'The front desk. Registers customers and vehicles, opens Job Cards and Vehicle Services, tells customers when estimates are approved, asks for jobs to be closed, and receives visitors.',
  'workshop-supervisor': 'Runs the jobs given to them: accepts supervising a job, assigns the technician, checks and approves the estimate, and marks the work ready for collection.',
  technician: 'Does the work on the jobs assigned to them: accepts or turns down a job, inspects the vehicle, writes the estimate and raises parts requests.',
  'workshop-manager': 'The branch manager. Gives final approval to estimates, approves closing and cancelling jobs, parts requests, outside purchases, warranty claims, exit passes, road tests and contractor passes. Sees the branch analytics.',
  'finance-officer': 'Handles money: records payments and refunds, reviews outside purchases and pays out the cash once approved.',
  'store-manager': 'Runs the store: parts, prices, stock levels, goods receipts, matching estimate parts and releasing parts. Authorises exit passes for the store team.',
  'store-officer': 'Works in the store: records goods receipts, matches estimate parts to stock, and approves, reserves and releases parts requests.',
  'warranty-hod': 'Heads warranty: registers and verifies warranties, approves warranty claims and manages providers and policies. Authorises exit passes for the warranty team.',
  'warranty-officer': 'Registers warranties and prepares warranty claims for the head of warranty to approve.',
  'department-head': 'Authorises exit passes for the people in their department before the Manager approves them.',
  'chief-security-officer': 'Runs the Security desk: the gate, visitors, vehicles, deliveries and contractors, and assigns, closes and reopens incidents.',
  'security-officer': 'Works the gate: signs visitors, vehicles, deliveries and contractors in and out, records exit-pass times and reports incidents.',
  'calendar-user': 'Keeps their own calendar and books appointments and meeting rooms.',
  'scheduling-admin': 'Manages meeting rooms and calendar aides, and can book on anyone\'s calendar.',
  broadcaster: 'Sends broadcasts (notices) to staff and customers.',
  'branch-assistant': 'IT support at the branch. Helps colleagues who are not comfortable with computers: with the colleague\'s own password, works on their tasks for a limited time. Every action is recorded as done for that colleague, with the assistant named. Cannot help managers, supervisors, finance or administrators, and approves nothing.',
};

/** Permissions that DECIDE something (approve, authorise, release, pay) —
 * listed separately on the Roles page and used for the Approvals menu. */
export const APPROVAL_PERMISSIONS: PermissionKey[] = [
  'workshop.job.supervise', 'workshop.estimate.approve', 'workshop.estimate.final_approve', 'workshop.close.approve', 'store.prs.approve_hod',
  'store.prs.release', 'procurement.epr.review', 'procurement.epr.approve', 'procurement.epr.disburse', 'warranty.claim.approve', 'security.pass.approve',
];

/** Store pages that show purchase costs and margins (goods receipts, pricing
 * alerts, cost per batch): the Store, Finance, management analytics and
 * Warranty (which traces parts back to their receipts). Not the workshop floor. */
export const STORE_COST_PERMISSIONS: PermissionKey[] = ['store.parts.manage', 'store.grn.record', 'analytics.inventory.view', 'warranty.view'];

/** How a scope reads to people. */
export const SCOPE_WORDS: Record<Scope, string> = {
  ALL: 'everywhere in the organisation', BRANCH: 'in their branch', DEPARTMENT: 'for their department', ASSIGNED: 'on work assigned to them', OWN: 'their own',
};
