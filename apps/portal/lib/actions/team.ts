'use server';

import { prisma } from '@ejo/database';
import { authorize, getPrincipal, myOrganisationId, reachWhere } from '@/lib/authz/server';
import { ROLE_LABELS } from '@/lib/authz/catalogue';
import { hqPeriod, type HqPeriodKey } from '@/lib/hq-core';
import { summariseTeam, type Handled, type PersonRow } from '@/lib/team-core';

/**
 * Team performance for leadership (analytics.business.view): every person who
 * handled a step in the period — jobs finished, estimates checked and
 * approved, parts and outside purchases approved, released and paid — with
 * how fast and how much. Within the viewer's reach (all branches, the branch
 * lens, or their own branch). Names and roles only; no customer details.
 */
export type TeamPerformance = {
  asOf: Date;
  period: { key: HqPeriodKey; label: string };
  people: PersonRow[];
  totals: { people: number; handled: number; withinPct: number | null; attention: number; strong: number };
  branchLabel: string;
};

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const CLOSED_JC = ['CLOSED', 'CHECKED_OUT', 'CANCELLED'] as const;

export async function getTeamPerformance(periodKey?: string): Promise<TeamPerformance> {
  await authorize('analytics.business.view', undefined, 'getTeamPerformance', 'Team performance is for leadership and managers.');
  const [reach, org, p] = await Promise.all([reachWhere('analytics.business.view'), myOrganisationId(), getPrincipal()]);
  const period = hqPeriod(periodKey);
  const range = { gte: period.from, lt: period.to };
  const all = org ? await prisma.branch.findMany({ where: { businessUnit: { organisationId: org } }, select: { id: true, name: true } }) : [];
  const rb = reach.branchId;
  const branches = typeof rb === 'string' ? all.filter((b) => b.id === rb) : rb && typeof rb === 'object' && 'in' in rb ? all.filter((b) => (rb.in as string[]).includes(b.id)) : all;
  const ids = branches.map((b) => b.id);
  const inB = { branchId: { in: ids } };

  const [jcDone, vsDone, est, svEst, prs, epr, reworks, openJc, openVs] = await Promise.all([
    prisma.jobCard.findMany({ where: { ...inB, completedAt: range, status: { not: 'CANCELLED' }, assignedTechnicianId: { not: null } }, select: { id: true, assignedTechnicianId: true, workStartedAt: true, createdAt: true, completedAt: true, estimate: { select: { lineItems: { select: { amount: true } } } } }, take: 10_000 }),
    prisma.vehicleService.findMany({ where: { ...inB, completedAt: range, status: { not: 'CANCELLED' }, assignedTechnicianId: { not: null } }, select: { assignedTechnicianId: true, workStartedAt: true, checkedInAt: true, createdAt: true, completedAt: true, serviceEstimate: { select: { lineItems: { select: { amount: true } } } } }, take: 10_000 }),
    prisma.estimate.findMany({ where: { jobCard: inB, OR: [{ approvedAt: range }, { managerApprovedAt: range }] }, select: { submittedAt: true, approvedAt: true, approvedById: true, managerApprovedAt: true, managerApprovedById: true }, take: 10_000 }),
    prisma.serviceEstimate.findMany({ where: { vehicleService: inB, OR: [{ approvedAt: range }, { managerApprovedAt: range }] }, select: { submittedAt: true, approvedAt: true, approvedById: true, managerApprovedAt: true, managerApprovedById: true }, take: 10_000 }),
    prisma.partRequestSlip.findMany({ where: { ...inB, OR: [{ hodApprovedAt: range }, { storeApprovedAt: range }, { releasedAt: range }] }, select: { createdAt: true, hodApprovedAt: true, hodApprovedById: true, storeApprovedAt: true, storeApprovedById: true, releasedAt: true, releasedById: true }, take: 10_000 }),
    prisma.externalProcurementRequest.findMany({ where: { ...inB, OR: [{ financeReviewedAt: range }, { managerApprovedAt: range }, { disbursedAt: range }] }, select: { createdAt: true, financeReviewedAt: true, financeReviewedById: true, managerApprovedAt: true, managerApprovedById: true, disbursedAt: true, disbursedById: true, disbursedAmount: true }, take: 10_000 }),
    org ? prisma.auditLog.findMany({ where: { organisationId: org, action: 'job_card.rework_requested', createdAt: range }, select: { entityId: true }, take: 10_000 }) : [],
    prisma.jobCard.groupBy({ by: ['assignedTechnicianId'], where: { ...inB, status: { notIn: [...CLOSED_JC] }, assignedTechnicianId: { not: null } }, _count: { _all: true } }),
    prisma.vehicleService.groupBy({ by: ['assignedTechnicianId'], where: { ...inB, status: { notIn: ['CLOSED', 'COLLECTED', 'CANCELLED', 'ESCALATED'] }, assignedTechnicianId: { not: null } }, _count: { _all: true } }),
  ]);

  const reworked = new Set(reworks.map((r) => r.entityId).filter((v): v is string => Boolean(v)));
  const inRange = (d: Date | null): d is Date => Boolean(d && d >= period.from && d < period.to);
  const items: Handled[] = [];
  for (const j of jcDone) items.push({ userId: j.assignedTechnicianId, kind: 'job', from: j.workStartedAt ?? j.createdAt, to: j.completedAt!, value: (j.estimate?.lineItems ?? []).reduce((n, l) => n + num(l.amount), 0), rework: reworked.has(j.id) });
  for (const v of vsDone) items.push({ userId: v.assignedTechnicianId, kind: 'job', from: v.workStartedAt ?? v.checkedInAt ?? v.createdAt, to: v.completedAt!, value: (v.serviceEstimate?.lineItems ?? []).reduce((n, l) => n + num(l.amount), 0) });
  for (const e of [...est, ...svEst]) {
    if (inRange(e.approvedAt)) items.push({ userId: e.approvedById, kind: 'estimateCheck', from: e.submittedAt, to: e.approvedAt });
    if (inRange(e.managerApprovedAt)) items.push({ userId: e.managerApprovedById, kind: 'estimateFinal', from: e.approvedAt, to: e.managerApprovedAt });
  }
  for (const s of prs) {
    if (inRange(s.hodApprovedAt)) items.push({ userId: s.hodApprovedById, kind: 'partsHod', from: s.createdAt, to: s.hodApprovedAt });
    if (inRange(s.storeApprovedAt)) items.push({ userId: s.storeApprovedById, kind: 'partsStore', from: s.hodApprovedAt, to: s.storeApprovedAt });
    if (inRange(s.releasedAt)) items.push({ userId: s.releasedById, kind: 'partsRelease', from: s.storeApprovedAt, to: s.releasedAt });
  }
  for (const e of epr) {
    if (inRange(e.financeReviewedAt)) items.push({ userId: e.financeReviewedById, kind: 'eprReview', from: e.createdAt, to: e.financeReviewedAt });
    if (inRange(e.managerApprovedAt)) items.push({ userId: e.managerApprovedById, kind: 'eprApprove', from: e.financeReviewedAt, to: e.managerApprovedAt });
    if (inRange(e.disbursedAt)) items.push({ userId: e.disbursedById, kind: 'eprPay', from: e.managerApprovedAt, to: e.disbursedAt, value: num(e.disbursedAmount) });
  }

  const open = new Map<string, number>();
  for (const r of [...openJc, ...openVs]) if (r.assignedTechnicianId) open.set(r.assignedTechnicianId, (open.get(r.assignedTechnicianId) ?? 0) + r._count._all);
  // The people: everyone who handled something, and every active member of staff in reach with an open job.
  const userIds = [...new Set([...items.map((h) => h.userId), ...open.keys()].filter((v): v is string => Boolean(v)))];
  const users = userIds.length && org ? await prisma.user.findMany({
    where: { id: { in: userIds }, organisationId: org },
    select: { id: true, fullName: true, branch: { select: { name: true } }, roles: { select: { role: { select: { slug: true, name: true, isSuperAdmin: true } } } } },
    take: 2000,
  }) : [];
  const people = users.filter((u) => !u.roles.some((r) => r.role.isSuperAdmin)).map((u) => ({
    id: u.id, name: u.fullName, branch: u.branch?.name ?? null,
    roles: u.roles.map((r) => ROLE_LABELS[r.role.slug] ?? r.role.name).join(', ') || 'No role',
  }));
  const rows = summariseTeam(items.filter((h) => people.some((x) => x.id === h.userId)), people, open);
  const timed = rows.reduce((n, r) => n + r.steps.reduce((m, s) => m + (s.withinPct === null ? 0 : s.count), 0), 0);
  const within = rows.reduce((n, r) => n + r.steps.reduce((m, s) => m + (s.withinPct === null ? 0 : Math.round((s.withinPct / 100) * s.count)), 0), 0);
  return {
    asOf: new Date(),
    period: { key: period.key, label: period.label },
    people: rows,
    totals: { people: rows.length, handled: rows.reduce((n, r) => n + r.handled, 0), withinPct: timed ? Math.round((within / timed) * 100) : null, attention: rows.filter((r) => r.rating === 'attention').length, strong: rows.filter((r) => r.rating === 'strong').length },
    branchLabel: branches.length === 1 ? branches[0]!.name : p.lensBranchId ? 'One branch' : `All ${branches.length} branches`,
  };
}
