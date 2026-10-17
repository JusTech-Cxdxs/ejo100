'use server';

import { prisma } from '@ejo/database';
import { allows, authorize, getPrincipal, myOrganisationId, reachWhere } from '@/lib/authz/server';
import { scopeFor } from '@/lib/authz/catalogue';
import { lagosYmd } from '@/lib/nigeria-calendar';
import { jobIsLate, jobStatuses } from '@/lib/job-runs';
import { schemaHealth } from '@/lib/schema-health';
import { enyoReady } from '@/lib/enyo/settings';
import type { SchemaVerdict } from '@/lib/schema-health-core';

/**
 * The two overview panels on the dashboard for the people who run the
 * organisation and the people who run its systems. Counts and totals only
 * (no customer details, no message text), computed here on the server with
 * the same fences as every page:
 *
 *  - leadership (analytics.business.view): work in the workshop, decisions
 *    waiting and how long, customer support, and each branch side by side —
 *    the viewer's reach (their branch, or the whole organisation);
 *  - IT (audit.view): people and sign-ins, errors, scheduled jobs, the
 *    database version, Enyo, support mailboxes — the viewer's organisation.
 */

const OPEN_JC = ['CLOSED', 'CHECKED_OUT', 'CANCELLED'] as const;
const OPEN_VS = ['CLOSED', 'COLLECTED', 'CANCELLED', 'ESCALATED'] as const;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const hoursSince = (d: Date | null | undefined, now: number) => (d ? Math.max(0, Math.round((now - d.getTime()) / 3_600_000)) : null);

/** The branches this person sees, always inside their own organisation (also for the platform team). */
async function myBranches(key: 'analytics.business.view'): Promise<string[]> {
  const reach = await reachWhere(key);
  const org = await myOrganisationId();
  const all = org ? (await prisma.branch.findMany({ where: { businessUnit: { organisationId: org } }, select: { id: true } })).map((b) => b.id) : [];
  const b = reach.branchId;
  if (typeof b === 'string') return all.includes(b) ? [b] : [];
  if (b && typeof b === 'object' && 'in' in b) return b.in.filter((id) => all.includes(id));
  return all;
}

export type Waiting = { key: string; label: string; count: number; oldestHours: number | null; href: string };
export type BranchRow = { id: string; name: string; inWorkshop: number; ready: number; openedThisMonth: number; collectedThisMonth: number };
export type LeadershipPulse = {
  asOf: Date;
  scope: 'organisation' | 'branch';
  workshop: { jobCardsIn: number; servicesIn: number; ready: number; awaitingParts: number; awaitingCustomer: number; turnaroundHours: number | null; checkedOut30d: number };
  waiting: Waiting[];
  support: { open: number; late: number; unassigned: number; csat: number | null; csatResponses: number } | null;
  branches: BranchRow[];
};

export async function getLeadershipPulse(): Promise<LeadershipPulse> {
  await authorize('analytics.business.view', undefined, 'getLeadershipPulse', 'This overview is for leadership and managers.');
  const branchIds = await myBranches('analytics.business.view');
  const reach = await reachWhere('analytics.business.view');
  const org = await myOrganisationId();
  const now = Date.now();
  const monthStart = new Date(`${lagosYmd(new Date()).slice(0, 8)}01T00:00:00+01:00`);
  const since30 = new Date(now - 30 * 86_400_000);
  const inB = { branchId: { in: branchIds } };
  const jcOpen = { ...inB, status: { notIn: [...OPEN_JC] } };
  const vsOpen = { ...inB, status: { notIn: [...OPEN_VS] } };

  const [jcIn, vsIn, jcReady, vsReady, parts, customer, out30, estSup, estMgr, prsHod, prsStore, eprFin, eprMgr, claimHod, claimMgr, passHead, passMgr, branches, jcByBranch, vsByBranch, readyByBranch, openedJc, openedVs, payJc, payVs] = await Promise.all([
    prisma.jobCard.count({ where: jcOpen }),
    prisma.vehicleService.count({ where: vsOpen }),
    prisma.jobCard.count({ where: { ...inB, status: 'READY_FOR_COLLECTION' } }),
    prisma.vehicleService.count({ where: { ...inB, status: 'READY_FOR_COLLECTION' } }),
    prisma.jobCard.count({ where: { ...inB, status: 'AWAITING_PARTS' } }),
    prisma.jobCard.count({ where: { ...inB, status: 'AWAITING_CUSTOMER_APPROVAL' } }),
    prisma.jobCard.findMany({ where: { ...inB, checkedOutAt: { gte: since30 } }, select: { createdAt: true, checkedOutAt: true }, take: 2000 }),
    prisma.estimate.aggregate({ where: { status: 'SUBMITTED', jobCard: inB }, _count: { _all: true }, _min: { submittedAt: true } }),
    prisma.estimate.aggregate({ where: { status: 'APPROVED', jobCard: inB }, _count: { _all: true }, _min: { approvedAt: true } }),
    prisma.partRequestSlip.aggregate({ where: { status: 'PENDING_HOD_APPROVAL', OR: [{ jobCard: inB }, { vehicleService: inB }] }, _count: { _all: true }, _min: { createdAt: true } }),
    prisma.partRequestSlip.aggregate({ where: { status: 'PENDING_STORE_APPROVAL', OR: [{ jobCard: inB }, { vehicleService: inB }] }, _count: { _all: true }, _min: { createdAt: true } }),
    prisma.externalProcurementRequest.aggregate({ where: { ...inB, status: 'PENDING_FINANCE_REVIEW' }, _count: { _all: true }, _min: { createdAt: true } }),
    prisma.externalProcurementRequest.aggregate({ where: { ...inB, status: 'PENDING_MANAGER_APPROVAL' }, _count: { _all: true }, _min: { createdAt: true } }),
    prisma.warrantyClaim.aggregate({ where: { status: 'PENDING_HOD', OR: [{ jobCard: inB }, { vehicleService: inB }, { customer: { organisationId: org ?? '__none__' }, jobCardId: null, vehicleServiceId: null }] }, _count: { _all: true }, _min: { createdAt: true } }),
    prisma.warrantyClaim.aggregate({ where: { status: 'PENDING_MANAGER', OR: [{ jobCard: inB }, { vehicleService: inB }, { customer: { organisationId: org ?? '__none__' }, jobCardId: null, vehicleServiceId: null }] }, _count: { _all: true }, _min: { createdAt: true } }),
    prisma.exitPass.aggregate({ where: { ...inB, status: 'PENDING_HEAD' }, _count: { _all: true }, _min: { createdAt: true } }),
    prisma.exitPass.aggregate({ where: { ...inB, status: 'PENDING_MANAGER' }, _count: { _all: true }, _min: { createdAt: true } }),
    prisma.branch.findMany({ where: { id: { in: branchIds }, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.jobCard.groupBy({ by: ['branchId'], where: jcOpen, _count: { _all: true } }),
    prisma.vehicleService.groupBy({ by: ['branchId'], where: vsOpen, _count: { _all: true } }),
    prisma.jobCard.groupBy({ by: ['branchId'], where: { ...inB, status: 'READY_FOR_COLLECTION' }, _count: { _all: true } }),
    prisma.jobCard.groupBy({ by: ['branchId'], where: { ...inB, createdAt: { gte: monthStart } }, _count: { _all: true } }),
    prisma.vehicleService.groupBy({ by: ['branchId'], where: { ...inB, createdAt: { gte: monthStart } }, _count: { _all: true } }),
    prisma.payment.findMany({ where: { recordedAt: { gte: monthStart }, jobCard: inB }, select: { amount: true, jobCard: { select: { branchId: true } } }, take: 20000 }),
    prisma.payment.findMany({ where: { recordedAt: { gte: monthStart }, vehicleService: inB }, select: { amount: true, vehicleService: { select: { branchId: true } } }, take: 20000 }),
  ]);

  const turn = out30.filter((j) => j.checkedOutAt).map((j) => (j.checkedOutAt!.getTime() - j.createdAt.getTime()) / 3_600_000).sort((a, b) => a - b);
  const median = turn.length ? Math.round(turn[Math.floor(turn.length / 2)]!) : null;

  const w = (key: string, label: string, a: { _count: { _all: number }; _min: Record<string, Date | null> }, href: string): Waiting => ({ key, label, count: a._count._all, oldestHours: hoursSince(Object.values(a._min)[0] ?? null, now), href });
  const waiting = [
    w('estimate_supervisor', 'Estimates waiting for the supervisor', estSup, '/approvals'),
    w('estimate_manager', 'Estimates waiting for final approval', estMgr, '/approvals'),
    w('prs_hod', 'Parts requests waiting for the manager', prsHod, '/workshop/parts-requests'),
    w('prs_store', 'Parts requests waiting for the Store', prsStore, '/workshop/parts-requests'),
    w('epr_finance', 'Outside purchases waiting for Finance', eprFin, '/workshop/external-procurement'),
    w('epr_manager', 'Outside purchases waiting for the manager', eprMgr, '/workshop/external-procurement'),
    w('claim_hod', 'Warranty claims waiting for the head of warranty', claimHod, '/warranty/claims'),
    w('claim_manager', 'Warranty claims waiting for the manager', claimMgr, '/warranty/claims'),
    w('pass_head', 'Exit passes waiting for the head of department', passHead, '/security/exit-passes'),
    w('pass_manager', 'Exit passes waiting for the manager', passMgr, '/security/exit-passes'),
  ];

  const count = (rows: { branchId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.branchId, r._count._all]));
  const jcB = count(jcByBranch), vsB = count(vsByBranch), readyB = count(readyByBranch), oJc = count(openedJc), oVs = count(openedVs);
  const collected = new Map<string, number>();
  for (const p of payJc) { const b = p.jobCard?.branchId; if (b) collected.set(b, (collected.get(b) ?? 0) + num(p.amount)); }
  for (const p of payVs) { const b = p.vehicleService?.branchId; if (b) collected.set(b, (collected.get(b) ?? 0) + num(p.amount)); }

  // Support: the requests within the viewer's reach (counts only); for those who also work it, the same numbers they see there.
  let support: LeadershipPulse['support'] = null;
  if (org) {
    // Within the viewer's reach: a branch-scoped viewer counts only their branches' requests.
    const inReach = typeof reach.branchId === 'string' ? { branchId: { in: branchIds } } : {};
    const openWhere = { organisationId: org, ...inReach, status: { in: ['OPEN' as const, 'WAITING_ON_CUSTOMER' as const, 'ON_HOLD' as const] } };
    const [open, late, unassigned, csat] = await Promise.all([
      prisma.supportTicket.count({ where: openWhere }),
      prisma.supportTicket.count({ where: { ...openWhere, slaBreachedAt: { not: null }, firstResponseAt: null } }),
      prisma.supportTicket.count({ where: { ...openWhere, assignedToId: null } }),
      prisma.supportTicket.aggregate({ where: { organisationId: org, ...inReach, csatScore: { not: null }, updatedAt: { gte: since30 } }, _avg: { csatScore: true }, _count: { csatScore: true } }),
    ]).catch(() => [0, 0, 0, null] as const);
    support = { open: open as number, late: late as number, unassigned: unassigned as number, csat: csat && csat._avg.csatScore !== null ? Math.round(csat._avg.csatScore * 10) / 10 : null, csatResponses: csat ? csat._count.csatScore : 0 };
  }

  return {
    asOf: new Date(),
    scope: typeof reach.branchId === 'string' ? 'branch' : 'organisation',
    workshop: { jobCardsIn: jcIn, servicesIn: vsIn, ready: jcReady + vsReady, awaitingParts: parts, awaitingCustomer: customer, turnaroundHours: median, checkedOut30d: out30.length },
    waiting,
    support,
    branches: branches.map((b) => ({ id: b.id, name: b.name, inWorkshop: (jcB.get(b.id) ?? 0) + (vsB.get(b.id) ?? 0), ready: readyB.get(b.id) ?? 0, openedThisMonth: (oJc.get(b.id) ?? 0) + (oVs.get(b.id) ?? 0), collectedThisMonth: Math.round(collected.get(b.id) ?? 0) })),
  };
}

export type ItPulse = {
  asOf: Date;
  people: { active: number; switchedOff: number; neverSignedIn: number; signedIn24h: number; failed24h: number; accountsUnderAttack: number };
  errors: { last24h: number; last7d: number; latest: { ref: string; at: Date; message: string; path: string | null }[] };
  access: { roleChanges7d: number; permissionChanges7d: number; deniedAttempts24h: number };
  jobs: { total: number; late: number; names: string[] };
  schema: SchemaVerdict;
  enyo: { ready: boolean; reason: string | null };
  mailboxes: { total: number; problems: number };
};

/** IT's overview: people and sign-ins, errors, access changes, scheduled jobs, database version, Enyo and mailboxes. */
export async function getItPulse(): Promise<ItPulse> {
  await authorize('audit.view', undefined, 'getItPulse', 'This overview is for IT and administrators.');
  const org = await myOrganisationId();
  const o = org ?? '__none__';
  const now = Date.now();
  const d1 = new Date(now - 86_400_000);
  const d7 = new Date(now - 7 * 86_400_000);
  const [active, off, never, signed, failed, failedBy, err24, err7, latest, roles, perms, denied, mailboxes, mailProblems, jobs, schema, enyo] = await Promise.all([
    prisma.user.count({ where: { organisationId: o, isActive: true } }),
    prisma.user.count({ where: { organisationId: o, isActive: false } }),
    prisma.user.count({ where: { organisationId: o, isActive: true, lastLoginAt: null } }),
    prisma.auditLog.count({ where: { organisationId: o, action: 'user.signed_in', createdAt: { gte: d1 } } }),
    prisma.auditLog.count({ where: { organisationId: o, action: 'user.sign_in_failed', createdAt: { gte: d1 } } }),
    prisma.auditLog.groupBy({ by: ['entityId'], where: { organisationId: o, action: 'user.sign_in_failed', createdAt: { gte: d1 } }, _count: { _all: true } }),
    prisma.errorEvent.count({ where: { organisationId: o, createdAt: { gte: d1 } } }),
    prisma.errorEvent.count({ where: { organisationId: o, createdAt: { gte: d7 } } }),
    prisma.errorEvent.findMany({ where: { organisationId: o }, orderBy: { createdAt: 'desc' }, take: 5, select: { ref: true, createdAt: true, message: true, path: true } }),
    prisma.auditLog.count({ where: { organisationId: o, action: { in: ['user.role_assigned', 'user.role_removed'] }, createdAt: { gte: d7 } } }),
    prisma.auditLog.count({ where: { organisationId: o, action: { in: ['role.permission_granted', 'role.permission_revoked'] }, createdAt: { gte: d7 } } }),
    prisma.auditLog.count({ where: { organisationId: o, action: 'access.denied', createdAt: { gte: d1 } } }),
    prisma.supportMailbox.count({ where: { organisationId: o } }).catch(() => 0),
    prisma.supportMailbox.count({ where: { organisationId: o, status: { notIn: ['ACTIVE', 'PAUSED'] } } }).catch(() => 0),
    jobStatuses().catch(() => ({ jobs: [] as Awaited<ReturnType<typeof jobStatuses>>['jobs'] })),
    schemaHealth(),
    enyoReady(org, 'staffAssistant').catch(() => ({ ready: false as const, reason: 'unknown' })),
  ]);
  // The same rule as Settings → System health.
  const late = jobs.jobs.filter((j) => jobIsLate(j, now));
  return {
    asOf: new Date(),
    people: { active, switchedOff: off, neverSignedIn: never, signedIn24h: signed, failed24h: failed, accountsUnderAttack: failedBy.filter((r) => r._count._all >= 5).length },
    errors: { last24h: err24, last7d: err7, latest: latest.map((e) => ({ ref: e.ref, at: e.createdAt, message: e.message.slice(0, 140), path: e.path })) },
    access: { roleChanges7d: roles, permissionChanges7d: perms, deniedAttempts24h: denied },
    jobs: { total: jobs.jobs.length, late: late.length, names: late.slice(0, 4).map((j) => j.name) },
    schema,
    enyo: { ready: enyo.ready, reason: enyo.ready ? null : String((enyo as { reason?: unknown }).reason ?? 'off') },
    mailboxes: { total: mailboxes, problems: mailProblems },
  };
}

/** Which overviews the dashboard shows this person. */
export async function overviewsFor(): Promise<{ leadership: boolean; it: boolean }> {
  const p = await getPrincipal();
  // Headquarters only: a branch manager keeps the branch dashboard (no branch-comparison panels).
  const orgWide = (k: 'analytics.business.view' | 'audit.view') => p.isSuperAdmin || scopeFor(p, k) === 'ALL';
  const [audit, users] = await Promise.all([allows('audit.view'), allows('admin.users.manage')]);
  return { leadership: orgWide('analytics.business.view'), it: audit && users && orgWide('audit.view') };
}
