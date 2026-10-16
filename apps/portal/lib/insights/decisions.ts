import 'server-only';
/**
 * The decision log, read from the records themselves (decisions-core.ts has
 * the rules): who asked, which step, which role decided, when, approved or
 * sent back and why. Organisation-fenced; branch-fenced when `branchIds` is
 * given; capped per step.
 */
import { createHash } from 'node:crypto';
import { prisma } from '@ejo/database';
import { trainingRow, type DecisionRow, type DecisionTrainingRow } from './decisions-core';

/** The newest decisions of each step (ordered, so a cap never samples at random). */
const CAP = 10_000;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export async function decisionLog(o: { organisationId: string; since: Date; branchIds?: string[] | null }): Promise<DecisionRow[]> {
  const branch = { businessUnit: { organisationId: o.organisationId }, ...(o.branchIds ? { id: { in: o.branchIds } } : {}) };
  const inOrg = { branch };
  const since = o.since;
  const [prs, epr, jobs, services, cancels, estimates, returns, claims] = await Promise.all([
    prisma.partRequestSlip.findMany({
      where: { ...inOrg, OR: [{ hodApprovedAt: { gte: since } }, { storeApprovedAt: { gte: since } }, { rejectedAt: { gte: since } }] },
      orderBy: { updatedAt: 'desc' }, take: CAP, select: { id: true, branchId: true, createdAt: true, requestedById: true, hodApprovedAt: true, hodApprovedById: true, storeApprovedAt: true, storeApprovedById: true, rejectedAt: true, rejectedById: true, rejectionStage: true, rejectionReason: true, _count: { select: { lines: true } } },
    }),
    prisma.externalProcurementRequest.findMany({
      where: { ...inOrg, OR: [{ financeReviewedAt: { gte: since } }, { managerApprovedAt: { gte: since } }, { rejectedAt: { gte: since } }] },
      orderBy: { updatedAt: 'desc' }, take: CAP, select: { id: true, branchId: true, createdAt: true, requestedById: true, estimatedAmount: true, approvedTotal: true, financeReviewedAt: true, financeReviewedById: true, managerApprovedAt: true, managerApprovedById: true, rejectedAt: true, rejectedById: true, rejectionStage: true, rejectionReason: true },
    }),
    prisma.jobCard.findMany({ where: { ...inOrg, approvedAt: { gte: since }, approvalStatus: { in: ['APPROVED', 'REJECTED'] } }, orderBy: { approvedAt: 'desc' }, take: CAP, select: { id: true, branchId: true, createdAt: true, createdById: true, approvedAt: true, approvedById: true, approvalStatus: true, rejectionReason: true } }),
    prisma.vehicleService.findMany({ where: { ...inOrg, approvedAt: { gte: since }, approvalStatus: { in: ['APPROVED', 'REJECTED'] } }, orderBy: { approvedAt: 'desc' }, take: CAP, select: { id: true, branchId: true, createdAt: true, createdById: true, approvedAt: true, approvedById: true, approvalStatus: true, rejectionReason: true } }),
    prisma.cancellationRequest.findMany({ where: { jobCard: inOrg, decidedAt: { gte: since }, status: { in: ['APPROVED', 'DECLINED'] } }, orderBy: { decidedAt: 'desc' }, take: CAP, select: { id: true, requestedAt: true, requestedById: true, decidedAt: true, decidedById: true, status: true, decisionNotes: true, jobCard: { select: { branchId: true } } } }),
    prisma.estimate.findMany({ where: { jobCard: inOrg, managerApprovedAt: { gte: since } }, orderBy: { managerApprovedAt: 'desc' }, take: CAP, select: { id: true, submittedAt: true, approvedAt: true, createdById: true, managerApprovedAt: true, managerApprovedById: true, jobCard: { select: { branchId: true } }, _count: { select: { lineItems: true } } } }),
    prisma.auditLog.findMany({ where: { organisationId: o.organisationId, action: 'estimate.returned_for_changes', createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: CAP, select: { id: true, userId: true, entityId: true, createdAt: true, metadata: true } }),
    prisma.warrantyClaim.findMany({ where: { customer: { organisationId: o.organisationId }, decidedAt: { gte: since }, status: { in: ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'SETTLED'] } }, orderBy: { decidedAt: 'desc' }, take: CAP, select: { id: true, submittedAt: true, createdById: true, decidedAt: true, decidedById: true, status: true, decisionNotes: true, claimedAmount: true, jobCard: { select: { branchId: true } }, vehicleService: { select: { branchId: true } } } }),
  ]);
  // Estimates sent back: the Job Card's estimate (requester and lines).
  const returnedJobIds = [...new Set(returns.map((r) => r.entityId).filter((x): x is string => Boolean(x)))];
  const returnedEstimates = returnedJobIds.length
    ? await prisma.estimate.findMany({ where: { jobCardId: { in: returnedJobIds }, jobCard: inOrg }, select: { jobCardId: true, createdById: true, submittedAt: true, jobCard: { select: { branchId: true } }, _count: { select: { lineItems: true } } } })
    : [];
  const estimateOf = new Map(returnedEstimates.map((e) => [e.jobCardId, e]));

  const rows: DecisionRow[] = [];
  const add = (r: Omit<DecisionRow, 'requesterRole' | 'deciderRole'> & { requester: string | null; decider: string | null }) => rows.push({ ...r, requesterRole: r.requester, deciderRole: r.decider });
  for (const s of prs) {
    if (s.hodApprovedAt && s.hodApprovedAt >= since) add({ id: `prs_hod:${s.id}`, step: 'prs_hod', rejected: false, at: s.hodApprovedAt, arrivedAt: s.createdAt, amount: 0, lines: s._count.lines, requester: s.requestedById, decider: s.hodApprovedById, reason: null, branchId: s.branchId });
    if (s.storeApprovedAt && s.storeApprovedAt >= since) add({ id: `prs_store:${s.id}`, step: 'prs_store', rejected: false, at: s.storeApprovedAt, arrivedAt: s.hodApprovedAt, amount: 0, lines: s._count.lines, requester: s.requestedById, decider: s.storeApprovedById, reason: null, branchId: s.branchId });
    if (s.rejectedAt && s.rejectedAt >= since) {
      const store = s.rejectionStage === 'STORE';
      add({ id: `prs_${store ? 'store' : 'hod'}:${s.id}`, step: store ? 'prs_store' : 'prs_hod', rejected: true, at: s.rejectedAt, arrivedAt: store ? s.hodApprovedAt : s.createdAt, amount: 0, lines: s._count.lines, requester: s.requestedById, decider: s.rejectedById, reason: s.rejectionReason, branchId: s.branchId });
    }
  }
  for (const e of epr) {
    const amount = num(e.estimatedAmount);
    if (e.financeReviewedAt && e.financeReviewedAt >= since) add({ id: `epr_finance:${e.id}`, step: 'epr_finance', rejected: false, at: e.financeReviewedAt, arrivedAt: e.createdAt, amount, lines: 1, requester: e.requestedById, decider: e.financeReviewedById, reason: null, branchId: e.branchId });
    if (e.managerApprovedAt && e.managerApprovedAt >= since) add({ id: `epr_manager:${e.id}`, step: 'epr_manager', rejected: false, at: e.managerApprovedAt, arrivedAt: e.financeReviewedAt, amount: num(e.approvedTotal ?? e.estimatedAmount), lines: 1, requester: e.requestedById, decider: e.managerApprovedById, reason: null, branchId: e.branchId });
    if (e.rejectedAt && e.rejectedAt >= since) {
      const manager = e.rejectionStage === 'MANAGER_APPROVAL';
      add({ id: `epr_${manager ? 'manager' : 'finance'}:${e.id}`, step: manager ? 'epr_manager' : 'epr_finance', rejected: true, at: e.rejectedAt, arrivedAt: manager ? e.financeReviewedAt : e.createdAt, amount, lines: 1, requester: e.requestedById, decider: e.rejectedById, reason: e.rejectionReason, branchId: e.branchId });
    }
  }
  for (const j of jobs) add({ id: `jc:${j.id}`, step: 'job_card_approval', rejected: j.approvalStatus === 'REJECTED', at: j.approvedAt!, arrivedAt: j.createdAt, amount: 0, lines: 0, requester: j.createdById, decider: j.approvedById, reason: j.rejectionReason, branchId: j.branchId });
  for (const v of services) add({ id: `vs:${v.id}`, step: 'service_approval', rejected: v.approvalStatus === 'REJECTED', at: v.approvedAt!, arrivedAt: v.createdAt, amount: 0, lines: 0, requester: v.createdById, decider: v.approvedById, reason: v.rejectionReason, branchId: v.branchId });
  for (const c of cancels) add({ id: `cancel:${c.id}`, step: 'job_cancellation', rejected: c.status === 'DECLINED', at: c.decidedAt!, arrivedAt: c.requestedAt, amount: 0, lines: 0, requester: c.requestedById, decider: c.decidedById, reason: c.decisionNotes, branchId: c.jobCard.branchId });
  for (const e of estimates) add({ id: `est:${e.id}:${e.managerApprovedAt!.getTime()}`, step: 'estimate_manager', rejected: false, at: e.managerApprovedAt!, arrivedAt: e.approvedAt ?? e.submittedAt, amount: 0, lines: e._count.lineItems, requester: e.createdById, decider: e.managerApprovedById, reason: null, branchId: e.jobCard.branchId });
  for (const r of returns) {
    const e = r.entityId ? estimateOf.get(r.entityId) : undefined;
    if (!e) continue;
    const reason = r.metadata && typeof r.metadata === 'object' && typeof (r.metadata as { reason?: unknown }).reason === 'string' ? String((r.metadata as { reason: string }).reason) : null;
    add({ id: `est-return:${r.id}`, step: 'estimate_manager', rejected: true, at: r.createdAt, arrivedAt: e.submittedAt, amount: 0, lines: e._count.lineItems, requester: e.createdById, decider: r.userId, reason, branchId: e.jobCard.branchId });
  }
  for (const c of claims) add({ id: `wc:${c.id}`, step: 'warranty_provider', rejected: c.status === 'REJECTED' || c.status === 'PARTIALLY_ACCEPTED', at: c.decidedAt!, arrivedAt: c.submittedAt, amount: num(c.claimedAmount), lines: 1, requester: c.createdById, decider: c.decidedById, reason: c.decisionNotes, branchId: c.jobCard?.branchId ?? c.vehicleService?.branchId ?? null });
  if (o.branchIds) for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i]!.branchId && !o.branchIds.includes(rows[i]!.branchId!)) rows.splice(i, 1);

  // People → their main role (the first by name), so nothing about the person goes further than their role.
  const people = [...new Set(rows.flatMap((r) => [r.requesterRole, r.deciderRole]).filter((x): x is string => Boolean(x)))];
  const roleOf = new Map<string, string>();
  for (let i = 0; i < people.length; i += 1000) {
    const batch = await prisma.userRole.findMany({ where: { userId: { in: people.slice(i, i + 1000) } }, orderBy: { role: { slug: 'asc' } }, select: { userId: true, role: { select: { slug: true, isSuperAdmin: true } } } });
    for (const b of batch) if (!roleOf.has(b.userId) && !b.role.isSuperAdmin) roleOf.set(b.userId, b.role.slug);
  }
  for (const r of rows) {
    r.requesterRole = r.requesterRole ? roleOf.get(r.requesterRole) ?? null : null;
    r.deciderRole = r.deciderRole ? roleOf.get(r.deciderRole) ?? null : null;
  }
  return rows.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The trainer's rows: roles, amounts and times only; the row id is a one-way hash (never a record id). */
export async function decisionsDataset(organisationId: string): Promise<DecisionTrainingRow[]> {
  const rows = await decisionLog({ organisationId, since: new Date(Date.now() - 3 * 365 * 86_400_000) });
  return rows.map((r) => trainingRow(r, createHash('sha256').update(`${organisationId}:${r.id}`).digest('hex').slice(0, 16)));
}
