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
  'workshop.job_card.create': { module: 'Workshop', label: 'Open Job Cards and Vehicle Services' },
  'workshop.estimate.approve': { module: 'Workshop', label: 'Approve estimates (Supervisor)' },
  'workshop.estimate.final_approve': { module: 'Workshop', label: 'Final approval of estimates (Manager)' },
  'workshop.close.approve': { module: 'Workshop', label: 'Approve closing and cancellation' },
  'workshop.payment.record': { module: 'Finance', label: 'Record payments' },
  'workshop.refund.record': { module: 'Finance', label: 'Record refunds' },
  // Store & procurement
  'store.view': { module: 'Store', label: 'Open the Store' },
  'store.parts.manage': { module: 'Store', label: 'Manage parts, pricing and stock levels' },
  'store.grn.record': { module: 'Store', label: 'Record goods receipts' },
  'store.prs.approve_hod': { module: 'Store', label: 'Approve parts requests (HOD)' },
  'store.prs.release': { module: 'Store', label: 'Approve, reserve and release parts' },
  'procurement.epr.review': { module: 'Procurement', label: 'Review outside purchases (Finance)' },
  'procurement.epr.approve': { module: 'Procurement', label: 'Approve outside purchases (Manager)' },
  'procurement.epr.disburse': { module: 'Procurement', label: 'Disburse cash for outside purchases' },
  // Warranty
  'warranty.view': { module: 'Warranty', label: 'View warranties and claims' },
  'warranty.manage': { module: 'Warranty', label: 'Register warranties and prepare claims' },
  'warranty.claim.approve': { module: 'Warranty', label: 'Approve warranty claims' },
  // Security
  'security.view': { module: 'Security', label: 'Open Security and book visitors' },
  'security.gate.operate': { module: 'Security', label: 'Operate the gate (visitors, vehicles, passes)' },
  'security.pass.approve': { module: 'Security', label: 'Approve exit passes, road tests and contractors' },
  'security.incident.manage': { module: 'Security', label: 'Assign, close and reopen incidents' },
  // Scheduling & notifications
  'schedule.view': { module: 'Scheduling', label: 'Use calendars and appointments' },
  'schedule.manage': { module: 'Scheduling', label: 'Manage meeting rooms and aides' },
  'notifications.broadcast.send': { module: 'Notifications', label: 'Send broadcasts' },
} as const;
export type PermissionKey = keyof typeof PERMISSIONS;

/** Everyone signed in (every role) — the everyday working baseline. */
const BASELINE: Partial<Record<PermissionKey, Scope>> = {
  'workshop.view': 'BRANCH', 'workshop.job_card.view': 'BRANCH', 'store.view': 'BRANCH', 'warranty.view': 'BRANCH',
  'security.view': 'BRANCH', 'schedule.view': 'OWN',
};

/** Default grants per role slug (database grants may add to these later). */
export const ROLE_GRANTS: Record<string, Partial<Record<PermissionKey, Scope>>> = {
  administrator: {
    'admin.organisation.manage': 'ALL', 'admin.structure.manage': 'ALL', 'admin.users.manage': 'ALL', 'admin.roles.manage': 'ALL', 'admin.settings.manage': 'ALL',
    'audit.view': 'ALL', 'analytics.business.view': 'ALL', 'analytics.inventory.view': 'ALL', 'analytics.warranty.view': 'ALL',
    'workshop.view': 'ALL', 'workshop.job_card.view': 'ALL', 'store.view': 'ALL', 'warranty.view': 'ALL', 'security.view': 'ALL', 'schedule.view': 'ALL', 'notifications.broadcast.send': 'ALL',
  },
  'workshop-manager': {
    'workshop.job_card.create': 'BRANCH', 'workshop.estimate.final_approve': 'BRANCH', 'workshop.close.approve': 'BRANCH', 'analytics.business.view': 'BRANCH',
    'store.prs.approve_hod': 'BRANCH', 'procurement.epr.approve': 'BRANCH', 'security.pass.approve': 'BRANCH', 'analytics.inventory.view': 'BRANCH', 'analytics.warranty.view': 'BRANCH',
  },
  'workshop-supervisor': { 'workshop.job_card.create': 'BRANCH', 'workshop.estimate.approve': 'ASSIGNED' },
  technician: {},
  'finance-officer': { 'workshop.payment.record': 'BRANCH', 'workshop.refund.record': 'BRANCH', 'procurement.epr.review': 'BRANCH', 'procurement.epr.disburse': 'BRANCH', 'analytics.business.view': 'BRANCH' },
  'store-manager': { 'store.parts.manage': 'BRANCH', 'store.grn.record': 'BRANCH', 'store.prs.release': 'BRANCH', 'analytics.inventory.view': 'BRANCH' },
  'store-officer': { 'store.grn.record': 'BRANCH', 'store.prs.release': 'BRANCH' },
  'warranty-hod': { 'warranty.manage': 'BRANCH', 'warranty.claim.approve': 'BRANCH', 'analytics.warranty.view': 'BRANCH' },
  'warranty-officer': { 'warranty.manage': 'BRANCH' },
  'department-head': { 'security.pass.approve': 'DEPARTMENT' },
  'chief-security-officer': { 'security.gate.operate': 'BRANCH', 'security.incident.manage': 'BRANCH' },
  'security-officer': { 'security.gate.operate': 'BRANCH' },
  receptionist: { 'security.gate.operate': 'BRANCH' },
  'calendar-user': { 'schedule.view': 'OWN' },
  'scheduling-admin': { 'schedule.view': 'ALL', 'schedule.manage': 'ALL' },
  broadcaster: { 'notifications.broadcast.send': 'ALL' },
};

export type Principal = { userId: string; isSuperAdmin: boolean; roleSlugs: string[]; branchId: string | null; departmentId: string | null; extraGrants?: Partial<Record<PermissionKey, Scope>> };
export type RecordContext = { branchId?: string | null; departmentId?: string | null; ownerIds?: (string | null | undefined)[]; assigneeIds?: (string | null | undefined)[] };
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
  if (!record || scope === 'ALL') return { allowed: true, scope, reason: scope === 'ALL' ? 'Granted for everything' : 'Granted' };
  const me = p.userId;
  const owns = (record.ownerIds ?? []).includes(me);
  const assigned = owns || (record.assigneeIds ?? []).includes(me);
  // A person with no branch on their profile is not limited to one branch (organisation-wide staff).
  const inBranch = !p.branchId || !record.branchId || record.branchId === p.branchId;
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
