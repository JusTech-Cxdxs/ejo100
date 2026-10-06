/**
 * EJO 100 — Authorization Catalogue (Phase B foundation).
 *
 * The ONE definition of what can be done in EJO 100, and the default grants
 * per role. Model: User → Role → Permission → Scope → Record → State → Action.
 *
 *  • Permissions are DEFINED here (version-controlled, reviewed): a permission
 *    without code that enforces it is meaningless, so definitions never come
 *    from a click. Grants can later be added per organisation in the database
 *    (RolePermission) — but only for permissions defined here.
 *  • Scope says WHICH records: ALL · BRANCH · DEPARTMENT · ASSIGNED · OWN.
 *  • `decide()` is a pure function — the same rule everywhere (pages, actions,
 *    search, exports, notifications, realtime, analytics, future AI), and fully
 *    testable with allowed AND denied cases.
 *  • State rules (who may move a record from one stage to the next) stay in
 *    each workflow action, which already checks the current status atomically.
 */
export type Scope = 'ALL' | 'BRANCH' | 'DEPARTMENT' | 'ASSIGNED' | 'OWN';
const RANK: Record<Scope, number> = { OWN: 1, ASSIGNED: 2, DEPARTMENT: 3, BRANCH: 4, ALL: 5 };

export const PERMISSIONS = {
  // Administration
  'admin.organisation.manage': { module: 'Administration', label: 'Manage the organisation profile' },
  'admin.structure.manage': { module: 'Administration', label: 'Manage business units, locations, branches, departments and teams' },
  'admin.users.manage': { module: 'Administration', label: 'Manage users' },
  'admin.roles.manage': { module: 'Administration', label: 'Manage roles and permissions' },
  'admin.settings.manage': { module: 'Administration', label: 'Manage settings, branding and modules' },
  'audit.view': { module: 'Administration', label: 'View the full audit trail' },
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
  'workshop.customer.notify': { module: 'Workshop', label: 'Notify customers of approved estimates (on jobs they opened) and send reminders' },
  'workshop.technician.assign': { module: 'Workshop', label: 'Assign technicians — on jobs they supervise' },
  'workshop.inspection.perform': { module: 'Workshop', label: 'Carry out vehicle inspections — on jobs assigned to them' },
  'workshop.estimate.edit': { module: 'Workshop', label: 'Prepare and submit estimates — on jobs assigned to them' },
  'workshop.job.work': { module: 'Workshop', label: 'Accept and carry out work — on jobs assigned to them' },
  'workshop.close.request': { module: 'Workshop', label: 'Request closing or cancellation — of jobs they opened or supervise' },
  'store.prs.approve_hod': { module: 'Workshop', label: 'Parts requests — first approval, before the Store (Manager)' },
  'workshop.payment.record': { module: 'Finance', label: 'Record payments' },
  'workshop.refund.record': { module: 'Finance', label: 'Record refunds' },
  // Store & procurement
  'store.view': { module: 'Store', label: 'Open the Store' },
  'store.parts.manage': { module: 'Store', label: 'Manage parts, prices, stock levels and pricing alerts' },
  'store.matching': { module: 'Store', label: 'Match estimate parts to items in stock' },
  'sourcing.request': { module: 'Store', label: 'Raise parts requests and outside purchases for jobs' },
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
  'security.view': { module: 'Security', label: 'Open Security and book visitors' },
  'security.gate.operate': { module: 'Security', label: 'Operate the gate — visitors, vehicles and passes in and out' },
  'security.reception.operate': { module: 'Security', label: 'Receive visitors at reception' },
  'security.pass.approve': { module: 'Security', label: 'Approve exit passes, road tests and contractors — when the request is waiting on them (reporting manager, head or branch manager)' },
  'security.incident.manage': { module: 'Security', label: 'Assign, close and reopen incidents' },
  // Scheduling & notifications
  'schedule.view': { module: 'Scheduling', label: 'Keep a calendar and book appointments (own calendar, or as an aide)' },
  'schedule.manage': { module: 'Scheduling', label: 'Manage meeting rooms and aides, and book on any calendar' },
  'notifications.broadcast.send': { module: 'Notifications', label: 'Send broadcasts' },
} as const;
export type PermissionKey = keyof typeof PERMISSIONS;

/** Everyone signed in (every role) — the everyday working baseline. */
const BASELINE: Partial<Record<PermissionKey, Scope>> = {
  'workshop.view': 'BRANCH', 'workshop.job_card.view': 'BRANCH', 'store.view': 'BRANCH', 'warranty.view': 'BRANCH',
  'security.view': 'BRANCH', 'sourcing.request': 'BRANCH',
  // Assignment-based — on jobs where THEY are the assigned supervisor / technician
  // (or, for requests to close, the person who opened it), whatever their role.
  'workshop.estimate.approve': 'ASSIGNED', 'workshop.estimate.edit': 'ASSIGNED', 'workshop.job.work': 'ASSIGNED',
  'workshop.inspection.perform': 'ASSIGNED', 'workshop.technician.assign': 'ASSIGNED', 'workshop.close.request': 'ASSIGNED', 'workshop.job.supervise': 'ASSIGNED',
  // Pass approvals go to the requester's reporting manager / head / branch manager — whoever it waits on.
  'security.pass.approve': 'ASSIGNED',
};

/** Default grants per role slug (database grants may add to these later). */
export const ROLE_GRANTS: Record<string, Partial<Record<PermissionKey, Scope>>> = {
  administrator: {
    'workshop.job_card.create': 'ALL', 'workshop.customer.manage': 'ALL', 'workshop.customer.notify': 'ALL', 'security.reception.operate': 'ALL',
    'admin.organisation.manage': 'ALL', 'admin.structure.manage': 'ALL', 'admin.users.manage': 'ALL', 'admin.roles.manage': 'ALL', 'admin.settings.manage': 'ALL',
    'audit.view': 'ALL', 'analytics.business.view': 'ALL', 'analytics.inventory.view': 'ALL', 'analytics.warranty.view': 'ALL',
    'workshop.view': 'ALL', 'workshop.job_card.view': 'ALL', 'store.view': 'ALL', 'warranty.view': 'ALL', 'security.view': 'ALL', 'schedule.view': 'OWN', 'notifications.broadcast.send': 'ALL',
  },
  'workshop-manager': {
    'workshop.job_card.create': 'BRANCH', 'workshop.customer.manage': 'BRANCH', 'workshop.customer.notify': 'BRANCH', 'workshop.estimate.final_approve': 'BRANCH',
    // The branch manager also manages warranty and approves claims (the code allows it).
    'warranty.manage': 'BRANCH', 'warranty.claim.approve': 'BRANCH', 'workshop.close.approve': 'BRANCH', 'analytics.business.view': 'BRANCH',
    'store.prs.approve_hod': 'BRANCH', 'procurement.epr.approve': 'BRANCH', 'security.pass.approve': 'BRANCH', 'analytics.inventory.view': 'BRANCH', 'analytics.warranty.view': 'BRANCH',
  },
  // Supervisors approve the estimates of jobs assigned to them (everyone's assigned scope) — they do not open jobs.
  'workshop-supervisor': {},
  technician: {},
  'finance-officer': { 'workshop.payment.record': 'BRANCH', 'workshop.refund.record': 'BRANCH', 'procurement.epr.review': 'BRANCH', 'procurement.epr.disburse': 'BRANCH', 'analytics.business.view': 'BRANCH', 'analytics.inventory.view': 'BRANCH' },
  'store-manager': { 'security.pass.approve': 'DEPARTMENT', 'store.matching': 'BRANCH', 'store.parts.manage': 'BRANCH', 'store.grn.record': 'BRANCH', 'store.prs.release': 'BRANCH', 'analytics.inventory.view': 'BRANCH' },
  // Store officers also manage parts (requireStoreStaff accepts them).
  'store-officer': { 'analytics.inventory.view': 'BRANCH', 'store.matching': 'BRANCH', 'store.parts.manage': 'BRANCH', 'store.grn.record': 'BRANCH', 'store.prs.release': 'BRANCH' },
  'warranty-hod': { 'security.pass.approve': 'DEPARTMENT', 'warranty.manage': 'BRANCH', 'warranty.claim.approve': 'BRANCH', 'analytics.warranty.view': 'BRANCH' },
  'warranty-officer': { 'warranty.manage': 'BRANCH', 'analytics.warranty.view': 'BRANCH' },
  'department-head': { 'security.pass.approve': 'DEPARTMENT' },
  'chief-security-officer': { 'security.gate.operate': 'BRANCH', 'security.reception.operate': 'BRANCH', 'security.incident.manage': 'BRANCH' },
  'security-officer': { 'security.gate.operate': 'BRANCH', 'security.reception.operate': 'BRANCH' },
  // Front desk: receives visitors, registers customers and vehicles, opens jobs.
  receptionist: { 'security.reception.operate': 'BRANCH', 'workshop.job_card.create': 'BRANCH', 'workshop.customer.manage': 'BRANCH', 'workshop.customer.notify': 'BRANCH' },
  'calendar-user': { 'schedule.view': 'OWN' },
  'scheduling-admin': { 'schedule.view': 'ALL', 'schedule.manage': 'ALL' },
  broadcaster: { 'notifications.broadcast.send': 'ALL' },
};

/** Steps only the platform team may take — never grantable to organisation roles. */
export const PLATFORM_ONLY: string[] = [
  'Permanently delete Job Cards, Vehicle Services and vehicles',
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
  organisation: 'admin.organisation.manage', 'business-units': 'admin.structure.manage', countries: 'admin.structure.manage', states: 'admin.structure.manage',
  cities: 'admin.structure.manage', branches: 'admin.structure.manage', departments: 'admin.structure.manage', teams: 'admin.structure.manage',
  users: 'admin.users.manage', roles: 'admin.roles.manage', permissions: 'admin.roles.manage', settings: 'admin.settings.manage', branding: 'admin.settings.manage',
  'module-registry': 'admin.settings.manage', 'audit-logs': 'audit.view', analytics: 'analytics.business.view',
};

/** How each role is named to people. */
export const ROLE_LABELS: Record<string, string> = {
  administrator: 'Administrator', 'workshop-manager': 'Workshop Manager', 'workshop-supervisor': 'Workshop Supervisor', technician: 'Technician',
  'finance-officer': 'Finance Officer', 'store-manager': 'Store Manager', 'store-officer': 'Store Officer', 'warranty-hod': 'Warranty HOD',
  'warranty-officer': 'Warranty Officer', 'department-head': 'Department Head', 'chief-security-officer': 'Chief Security Officer',
  'security-officer': 'Security Officer', receptionist: 'Receptionist', 'calendar-user': 'Calendar User', 'scheduling-admin': 'Scheduling Admin', broadcaster: 'Broadcaster',
};
