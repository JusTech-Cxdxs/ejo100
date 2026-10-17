'use server';

import { prisma } from '@ejo/database';
import { allows, authorize, getPrincipal, myOrganisationId, reachWhere } from '@/lib/authz/server';
import { branchHealth, hqPeriod, median, type Health, type HqBranch, type HqPeriodKey } from '@/lib/hq-core';
import { broadcastState, BROADCAST_CATEGORY, AUDIENCE_LABEL, BROADCAST_STATE_LABEL } from '@/lib/notification-rules';

/**
 * Headquarters: the organisation for the people who run it — every branch
 * side by side for a chosen period, where decisions are waiting, the people,
 * customers, and the notices sent. Counts and totals only (no customer
 * details), within the viewer's reach (analytics.business.view): the whole
 * organisation for leadership, one branch for a branch manager.
 */

const CLOSED_JC = ['CLOSED', 'CHECKED_OUT', 'CANCELLED'] as const;
const CLOSED_VS = ['CLOSED', 'COLLECTED', 'CANCELLED', 'ESCALATED'] as const;
const OPEN_SUPPORT = ['OPEN', 'WAITING_ON_CUSTOMER', 'ON_HOLD'] as const;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export type HqRow = HqBranch & { health: Health };
export type Headquarters = {
  asOf: Date;
  period: { key: HqPeriodKey; label: string; from: Date; to: Date };
  scope: 'organisation' | 'branch';
  organisationName: string | null;
  branches: HqRow[];
  totals: { staff: number; staffAtHeadOffice: number | null; staffNew: number; customersNew: number | null; opened: number; finished: number; collected: number; inWorkshop: number; ready: number; waiting: number; supportOpen: number; supportLate: number; branchesToAct: number };
  broadcasts: { id: string; number: string; title: string; category: string; audience: string; state: string; startsAt: Date }[] | null;
  canBroadcast: boolean;
};

export async function getHeadquarters(periodKey?: string): Promise<Headquarters> {
  await authorize('analytics.business.view', undefined, 'getHeadquarters', 'Headquarters is for leadership and managers.');
  const [reach, org, p] = await Promise.all([reachWhere('analytics.business.view'), myOrganisationId(), getPrincipal()]);
  const period = hqPeriod(periodKey);
  const range = { gte: period.from, lt: period.to };
  const now = Date.now();

  // The branches in reach, always inside the viewer's own organisation.
  const all = org ? await prisma.branch.findMany({ where: { businessUnit: { organisationId: org }, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }) : [];
  const rb = reach.branchId;
  const branches = typeof rb === 'string' ? all.filter((b) => b.id === rb) : rb && typeof rb === 'object' && 'in' in rb ? all.filter((b) => (rb.in as string[]).includes(b.id)) : all;
  const ids = branches.map((b) => b.id);
  const inB = { branchId: { in: ids } };
  const orgWide = !(typeof rb === 'string' || (rb && typeof rb === 'object'));

  const [organisation, staff, staffNew, customersNew, jcOpened, vsOpened, jcDone, vsDone, payJc, payVs, refJc, refVs, jcIn, vsIn, jcReady, vsReady, est, prs, epr, passes, claims, supOpen, supLate, outs, canBroadcast] = await Promise.all([
    org ? prisma.organisation.findUnique({ where: { id: org }, select: { name: true } }) : null,
    prisma.user.groupBy({ by: ['branchId'], where: { organisationId: org ?? '__none__', isActive: true, ...inB }, _count: { _all: true } }),
    prisma.user.count({ where: { organisationId: org ?? '__none__', ...(orgWide ? {} : inB), createdAt: range } }),
    orgWide && org ? prisma.customer.count({ where: { organisationId: org, createdAt: range } }) : null,
    prisma.jobCard.groupBy({ by: ['branchId'], where: { ...inB, createdAt: range }, _count: { _all: true } }),
    prisma.vehicleService.groupBy({ by: ['branchId'], where: { ...inB, createdAt: range }, _count: { _all: true } }),
    prisma.jobCard.groupBy({ by: ['branchId'], where: { ...inB, completedAt: range, status: { not: 'CANCELLED' } }, _count: { _all: true } }),
    prisma.vehicleService.groupBy({ by: ['branchId'], where: { ...inB, completedAt: range, status: { not: 'CANCELLED' } }, _count: { _all: true } }),
    prisma.payment.findMany({ where: { recordedAt: range, jobCard: inB }, select: { amount: true, jobCard: { select: { branchId: true } } }, take: 50_000 }),
    prisma.payment.findMany({ where: { recordedAt: range, vehicleService: inB }, select: { amount: true, vehicleService: { select: { branchId: true } } }, take: 50_000 }),
    prisma.refund.findMany({ where: { recordedAt: range, jobCard: inB }, select: { amount: true, jobCard: { select: { branchId: true } } }, take: 20_000 }),
    prisma.refund.findMany({ where: { recordedAt: range, vehicleService: inB }, select: { amount: true, vehicleService: { select: { branchId: true } } }, take: 20_000 }),
    prisma.jobCard.groupBy({ by: ['branchId'], where: { ...inB, status: { notIn: [...CLOSED_JC] } }, _count: { _all: true } }),
    prisma.vehicleService.groupBy({ by: ['branchId'], where: { ...inB, status: { notIn: [...CLOSED_VS] } }, _count: { _all: true } }),
    prisma.jobCard.groupBy({ by: ['branchId'], where: { ...inB, status: 'READY_FOR_COLLECTION' }, _count: { _all: true } }),
    prisma.vehicleService.groupBy({ by: ['branchId'], where: { ...inB, status: 'READY_FOR_COLLECTION' }, _count: { _all: true } }),
    prisma.estimate.findMany({ where: { status: { in: ['SUBMITTED', 'APPROVED'] }, jobCard: inB }, select: { submittedAt: true, approvedAt: true, createdAt: true, jobCard: { select: { branchId: true } } }, take: 5_000 }),
    prisma.partRequestSlip.findMany({ where: { ...inB, status: { in: ['PENDING_HOD_APPROVAL', 'PENDING_STORE_APPROVAL'] } }, select: { branchId: true, createdAt: true }, take: 5_000 }),
    prisma.externalProcurementRequest.findMany({ where: { ...inB, status: { in: ['PENDING_FINANCE_REVIEW', 'PENDING_MANAGER_APPROVAL'] } }, select: { branchId: true, createdAt: true }, take: 5_000 }),
    prisma.exitPass.findMany({ where: { ...inB, status: { in: ['PENDING_HEAD', 'PENDING_MANAGER'] } }, select: { branchId: true, createdAt: true }, take: 5_000 }),
    prisma.warrantyClaim.findMany({ where: { status: { in: ['PENDING_HOD', 'PENDING_MANAGER'] }, OR: [{ jobCard: inB }, { vehicleService: inB }] }, select: { submittedAt: true, createdAt: true, jobCard: { select: { branchId: true } }, vehicleService: { select: { branchId: true } } }, take: 5_000 }),
    org ? prisma.supportTicket.groupBy({ by: ['branchId'], where: { organisationId: org, ...inB, status: { in: [...OPEN_SUPPORT] } }, _count: { _all: true } }).catch(() => []) : [],
    org ? prisma.supportTicket.groupBy({ by: ['branchId'], where: { organisationId: org, ...inB, status: { in: [...OPEN_SUPPORT] }, slaBreachedAt: { not: null }, firstResponseAt: null }, _count: { _all: true } }).catch(() => []) : [],
    prisma.jobCard.findMany({ where: { ...inB, checkedOutAt: range }, select: { branchId: true, createdAt: true, checkedOutAt: true }, take: 10_000 }),
    allows('notifications.broadcast.send'),
  ]);
  // People with no branch (head office): counted for an organisation-wide view only.
  const headOffice = orgWide && org ? await prisma.user.count({ where: { organisationId: org, isActive: true, branchId: null } }) : null;

  const byBranch = (rows: { branchId: string | null; _count: { _all: number } }[]) => new Map(rows.filter((r) => r.branchId).map((r) => [r.branchId as string, r._count._all]));
  const add = (m: Map<string, number>, b: string | null | undefined, v: number) => { if (b) m.set(b, (m.get(b) ?? 0) + v); };
  const staffB = byBranch(staff), opJ = byBranch(jcOpened), opV = byBranch(vsOpened), dnJ = byBranch(jcDone), dnV = byBranch(vsDone);
  const inJ = byBranch(jcIn), inV = byBranch(vsIn), rdJ = byBranch(jcReady), rdV = byBranch(vsReady), sOpen = byBranch(supOpen), sLate = byBranch(supLate);

  const money = new Map<string, number>();
  for (const x of payJc) add(money, x.jobCard?.branchId, num(x.amount));
  for (const x of payVs) add(money, x.vehicleService?.branchId, num(x.amount));
  for (const x of refJc) add(money, x.jobCard?.branchId, -num(x.amount));
  for (const x of refVs) add(money, x.vehicleService?.branchId, -num(x.amount));

  // Decisions waiting: how many, and since when (the oldest).
  const waitN = new Map<string, number>();
  const oldest = new Map<string, number>();
  const wait = (b: string | null | undefined, since: Date | null | undefined) => {
    if (!b) return;
    add(waitN, b, 1);
    if (since) oldest.set(b, Math.min(oldest.get(b) ?? Infinity, since.getTime()));
  };
  for (const e of est) wait(e.jobCard.branchId, e.approvedAt ?? e.submittedAt ?? e.createdAt);
  for (const x of prs) wait(x.branchId, x.createdAt);
  for (const x of epr) wait(x.branchId, x.createdAt);
  for (const x of passes) wait(x.branchId, x.createdAt);
  for (const c of claims) wait(c.jobCard?.branchId ?? c.vehicleService?.branchId, c.submittedAt ?? c.createdAt);

  const turn = new Map<string, number[]>();
  for (const j of outs) if (j.checkedOutAt) turn.set(j.branchId, [...(turn.get(j.branchId) ?? []), (j.checkedOutAt.getTime() - j.createdAt.getTime()) / 3_600_000]);

  const rows: HqRow[] = branches.map((b) => {
    const o = oldest.get(b.id);
    const t = median(turn.get(b.id) ?? []);
    const row: HqBranch = {
      id: b.id, name: b.name, staff: staffB.get(b.id) ?? 0,
      opened: (opJ.get(b.id) ?? 0) + (opV.get(b.id) ?? 0),
      finished: (dnJ.get(b.id) ?? 0) + (dnV.get(b.id) ?? 0),
      collected: Math.round(money.get(b.id) ?? 0),
      inWorkshop: (inJ.get(b.id) ?? 0) + (inV.get(b.id) ?? 0),
      ready: (rdJ.get(b.id) ?? 0) + (rdV.get(b.id) ?? 0),
      waiting: waitN.get(b.id) ?? 0,
      oldestWaitingHours: o === undefined ? null : Math.max(0, Math.round((now - o) / 3_600_000)),
      supportOpen: sOpen.get(b.id) ?? 0,
      supportLate: sLate.get(b.id) ?? 0,
      turnaroundHours: t === null ? null : Math.round(t),
    };
    return { ...row, health: branchHealth(row) };
  });
  const sum = (k: keyof HqBranch) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);

  // Notices: the organisation's latest five, for those who send them.
  const recent = canBroadcast && org
    ? await prisma.broadcast.findMany({ where: { organisationId: org }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, broadcastNumber: true, title: true, category: true, audience: true, isActive: true, startsAt: true, endsAt: true, stoppedAt: true } })
    : null;

  return {
    asOf: new Date(),
    period: { key: period.key, label: period.label, from: period.from, to: period.to },
    scope: orgWide || p.isSuperAdmin ? 'organisation' : 'branch',
    organisationName: organisation?.name ?? null,
    branches: rows,
    totals: {
      staff: sum('staff') + (headOffice ?? 0), staffAtHeadOffice: headOffice, staffNew, customersNew, opened: sum('opened'), finished: sum('finished'), collected: sum('collected'),
      inWorkshop: sum('inWorkshop'), ready: sum('ready'), waiting: sum('waiting'), supportOpen: sum('supportOpen'), supportLate: sum('supportLate'),
      branchesToAct: rows.filter((r) => r.health.tone === 'act').length,
    },
    broadcasts: recent ? recent.map((b) => ({
      id: b.id, number: b.broadcastNumber, title: b.title,
      category: BROADCAST_CATEGORY[b.category]?.label ?? b.category,
      audience: AUDIENCE_LABEL[b.audience] ?? b.audience,
      state: BROADCAST_STATE_LABEL[broadcastState(b)], startsAt: b.startsAt,
    })) : null,
    canBroadcast,
  };
}
