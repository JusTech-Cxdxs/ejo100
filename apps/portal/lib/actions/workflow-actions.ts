'use server';

import { prisma } from '@ejo/database';
import { requireUser, currentUserIsMasterAdmin, listEligibleManagersForBranch, listEligibleFinanceOfficersForBranch } from './workshop';
import { listEligibleStoreManagersForBranch, listEligibleStoreOfficersForBranch } from './store';

export type WorkflowAction = { id: string; title: string; detail: string; url: string; createdAt: Date };

/**
 * Every workflow step that is waiting on THIS person, across Job Cards,
 * Vehicle Services, estimates, store matching, PRS and EPR. Each item is
 * derived from the record's live state, so it stays on the dashboard (and
 * marquee) until the step is done — and disappears the moment it is.
 * Who may act follows the same rule the action itself enforces (supervisor,
 * branch manager, store staff, finance, creator). One parallel round.
 */
export async function getWorkflowActionItems(): Promise<WorkflowAction[]> {
  const user = await requireUser();
  const isMaster = await currentUserIsMasterAdmin();
  const T = 40;
  const jc = { select: { id: true, jobNumber: true, branchId: true, supervisorId: true, createdById: true } } as const;
  const sv = { select: { id: true, serviceNumber: true, branchId: true, supervisorId: true, createdById: true } } as const;
  const [estSubmitted, estApproved, estToNotify, estMatching, sEstSubmitted, sEstApproved, sEstToNotify, sEstMatching, prs, epr, jcClosed, jcCompleted, svCompleted, svClosed] = await Promise.all([
    prisma.estimate.findMany({ where: { status: 'SUBMITTED' }, take: T, select: { updatedAt: true, jobCard: jc } }),
    prisma.estimate.findMany({ where: { status: 'APPROVED' }, take: T, select: { updatedAt: true, jobCard: jc } }),
    prisma.estimate.findMany({ where: { status: 'MANAGER_APPROVED', customerNotifiedAt: null, jobCard: { status: { notIn: ['CHECKED_OUT', 'CANCELLED'] } } }, take: T, select: { managerApprovedAt: true, jobCard: jc } }),
    prisma.estimate.findMany({ where: { matchingRequestedAt: { not: null }, lineItems: { some: { type: 'STORE_PART', matchedPartId: null } }, jobCard: { status: { notIn: ['CHECKED_OUT', 'CANCELLED'] } } }, take: T, select: { matchingRequestedAt: true, jobCard: jc } }),
    prisma.serviceEstimate.findMany({ where: { status: 'SUBMITTED' }, take: T, select: { updatedAt: true, vehicleService: sv } }),
    prisma.serviceEstimate.findMany({ where: { status: 'APPROVED' }, take: T, select: { updatedAt: true, vehicleService: sv } }),
    prisma.serviceEstimate.findMany({ where: { status: 'MANAGER_APPROVED', customerNotifiedAt: null, vehicleService: { status: { notIn: ['COLLECTED', 'CANCELLED', 'ESCALATED'] } } }, take: T, select: { managerApprovedAt: true, vehicleService: sv } }),
    prisma.serviceEstimate.findMany({ where: { matchingRequestedAt: { not: null }, lineItems: { some: { type: 'STORE_PART', matchedPartId: null } }, vehicleService: { status: { notIn: ['COLLECTED', 'CANCELLED', 'ESCALATED'] } } }, take: T, select: { matchingRequestedAt: true, vehicleService: sv } }),
    prisma.partRequestSlip.findMany({ where: { status: { in: ['PENDING_HOD_APPROVAL', 'PENDING_STORE_APPROVAL', 'APPROVED'] } }, take: T, select: { id: true, referenceNumber: true, status: true, branchId: true, updatedAt: true } }),
    prisma.externalProcurementRequest.findMany({ where: { status: { in: ['PENDING_FINANCE_REVIEW', 'PENDING_MANAGER_APPROVAL', 'APPROVED'] } }, take: T, select: { id: true, referenceNumber: true, status: true, branchId: true, updatedAt: true } }),
    prisma.jobCard.findMany({ where: { status: 'CLOSED' }, take: T, select: { id: true, jobNumber: true, createdById: true, updatedAt: true } }),
    prisma.jobCard.findMany({ where: { status: 'COMPLETED' }, take: T, select: { id: true, jobNumber: true, supervisorId: true, updatedAt: true } }),
    prisma.vehicleService.findMany({ where: { status: 'COMPLETED', escalatedToJobCardId: null }, take: T, select: { id: true, serviceNumber: true, supervisorId: true, completedAt: true } }),
    prisma.vehicleService.findMany({ where: { status: 'CLOSED', escalatedToJobCardId: null }, take: T, select: { id: true, serviceNumber: true, createdById: true, closedAt: true } }),
  ]);

  // Who counts as manager / finance / store for each branch involved.
  const branches = [...new Set([...estApproved.map((e) => e.jobCard.branchId), ...sEstApproved.map((e) => e.vehicleService.branchId), ...estMatching.map((e) => e.jobCard.branchId), ...sEstMatching.map((e) => e.vehicleService.branchId), ...prs.map((p) => p.branchId), ...epr.map((p) => p.branchId)])];
  const roleOf = new Map<string, { manager: boolean; finance: boolean; store: boolean }>();
  await Promise.all(branches.map(async (b) => {
    const [m, f, sm, so] = await Promise.all([
      listEligibleManagersForBranch(b).catch(() => ({ supervisors: [] as { id: string }[] })),
      listEligibleFinanceOfficersForBranch(b).catch(() => ({ supervisors: [] as { id: string }[] })),
      listEligibleStoreManagersForBranch(b).catch(() => ({ staff: [] as { id: string }[] })),
      listEligibleStoreOfficersForBranch(b).catch(() => ({ staff: [] as { id: string }[] })),
    ]);
    const has = (xs: { id: string }[]) => xs.some((x) => x.id === user.id);
    roleOf.set(b, { manager: isMaster || has(m.supervisors), finance: isMaster || has(f.supervisors), store: isMaster || has([...(sm.staff ?? []), ...(so.staff ?? [])]) });
  }));
  const can = (b: string, r: 'manager' | 'finance' | 'store') => roleOf.get(b)?.[r] ?? isMaster;
  const mine = (id: string | null) => id === user.id || (isMaster && !id);
  const out: WorkflowAction[] = [];
  const jcUrl = (id: string, a: string) => `/workshop/job-cards/${id}#${a}`;
  const svUrl = (id: string, a: string) => `/workshop/vehicle-service/${id}#${a}`;
  const at = (d: Date | null | undefined) => (d ? new Date(d) : new Date());

  for (const e of estSubmitted) if (e.jobCard.supervisorId === user.id || isMaster) out.push({ id: `est-sub-${e.jobCard.id}`, title: `Approve the estimate — ${e.jobCard.jobNumber}`, detail: 'Submitted for your validation as Supervisor.', url: jcUrl(e.jobCard.id, 'estimate'), createdAt: at(e.updatedAt) });
  for (const e of sEstSubmitted) if (e.vehicleService.supervisorId === user.id || isMaster) out.push({ id: `sest-sub-${e.vehicleService.id}`, title: `Approve the estimate — ${e.vehicleService.serviceNumber}`, detail: 'Submitted for your validation as Supervisor.', url: svUrl(e.vehicleService.id, 'estimate'), createdAt: at(e.updatedAt) });
  for (const e of estApproved) if (can(e.jobCard.branchId, 'manager')) out.push({ id: `est-mgr-${e.jobCard.id}`, title: `Final approval of the estimate — ${e.jobCard.jobNumber}`, detail: 'Validated by the Supervisor — needs a Manager.', url: jcUrl(e.jobCard.id, 'estimate'), createdAt: at(e.updatedAt) });
  for (const e of sEstApproved) if (can(e.vehicleService.branchId, 'manager')) out.push({ id: `sest-mgr-${e.vehicleService.id}`, title: `Final approval of the estimate — ${e.vehicleService.serviceNumber}`, detail: 'Validated by the Supervisor — needs a Manager.', url: svUrl(e.vehicleService.id, 'estimate'), createdAt: at(e.updatedAt) });
  for (const e of estToNotify) if (mine(e.jobCard.createdById)) out.push({ id: `est-ntf-${e.jobCard.id}`, title: `Notify the customer — ${e.jobCard.jobNumber}`, detail: 'The estimate is fully approved — send it to the customer.', url: jcUrl(e.jobCard.id, 'estimate'), createdAt: at(e.managerApprovedAt) });
  for (const e of sEstToNotify) if (mine(e.vehicleService.createdById)) out.push({ id: `sest-ntf-${e.vehicleService.id}`, title: `Notify the customer — ${e.vehicleService.serviceNumber}`, detail: 'The estimate is fully approved — send it to the customer.', url: svUrl(e.vehicleService.id, 'estimate'), createdAt: at(e.managerApprovedAt) });
  for (const e of estMatching) if (can(e.jobCard.branchId, 'store')) out.push({ id: `est-match-${e.jobCard.id}`, title: `Match the store parts — ${e.jobCard.jobNumber}`, detail: 'Store matching was requested and some parts are not matched yet.', url: `/inventory/estimate-matching/${e.jobCard.id}`, createdAt: at(e.matchingRequestedAt) });
  for (const e of sEstMatching) if (can(e.vehicleService.branchId, 'store')) out.push({ id: `sest-match-${e.vehicleService.id}`, title: `Match the store parts — ${e.vehicleService.serviceNumber}`, detail: 'Store matching was requested and some parts are not matched yet.', url: `/inventory/service-estimate-matching/${e.vehicleService.id}`, createdAt: at(e.matchingRequestedAt) });
  for (const p of prs) {
    const url = `/workshop/parts-requests/${p.id}`;
    if (p.status === 'PENDING_HOD_APPROVAL' && can(p.branchId, 'manager')) out.push({ id: `prs-hod-${p.id}`, title: `Approve the parts request — ${p.referenceNumber}`, detail: 'Waiting on HOD approval.', url, createdAt: at(p.updatedAt) });
    if (p.status === 'PENDING_STORE_APPROVAL' && can(p.branchId, 'store')) out.push({ id: `prs-store-${p.id}`, title: `Approve and reserve — ${p.referenceNumber}`, detail: 'HOD approved — the Store can approve and reserve the parts.', url, createdAt: at(p.updatedAt) });
    if (p.status === 'APPROVED' && can(p.branchId, 'store')) out.push({ id: `prs-rel-${p.id}`, title: `Release the parts — ${p.referenceNumber}`, detail: 'Approved and reserved — hand the parts over.', url, createdAt: at(p.updatedAt) });
  }
  for (const p of epr) {
    const url = `/workshop/external-procurement/${p.id}`;
    if (p.status === 'PENDING_FINANCE_REVIEW' && can(p.branchId, 'finance')) out.push({ id: `epr-fin-${p.id}`, title: `Review the outside purchase — ${p.referenceNumber}`, detail: 'Finance review, then send to the Manager.', url, createdAt: at(p.updatedAt) });
    if (p.status === 'PENDING_MANAGER_APPROVAL' && can(p.branchId, 'manager')) out.push({ id: `epr-mgr-${p.id}`, title: `Approve the outside purchase — ${p.referenceNumber}`, detail: 'Reviewed by Finance — needs a Manager.', url, createdAt: at(p.updatedAt) });
    if (p.status === 'APPROVED' && can(p.branchId, 'finance')) out.push({ id: `epr-pay-${p.id}`, title: `Disburse the cash — ${p.referenceNumber}`, detail: 'Approved — pay out so the parts can be bought.', url, createdAt: at(p.updatedAt) });
  }
  for (const j of jcCompleted) if (j.supervisorId === user.id || isMaster) out.push({ id: `jc-ready-${j.id}`, title: `Mark ready for collection — ${j.jobNumber}`, detail: 'The work is completed.', url: jcUrl(j.id, 'status'), createdAt: at(j.updatedAt) });
  for (const v of svCompleted) if (v.supervisorId === user.id || isMaster) out.push({ id: `sv-ready-${v.id}`, title: `Mark ready for collection — ${v.serviceNumber}`, detail: 'The service is completed.', url: svUrl(v.id, 'status'), createdAt: at(v.completedAt) });
  for (const j of jcClosed) if (mine(j.createdById)) out.push({ id: `jc-out-${j.id}`, title: `Check the vehicle out — ${j.jobNumber}`, detail: 'Closed by the Manager — release the vehicle to the customer.', url: jcUrl(j.id, 'status'), createdAt: at(j.updatedAt) });
  for (const v of svClosed) if (mine(v.createdById)) out.push({ id: `sv-out-${v.id}`, title: `Check the vehicle out — ${v.serviceNumber}`, detail: 'Closed by the Manager — release the vehicle to the customer.', url: svUrl(v.id, 'status'), createdAt: at(v.closedAt) });
  return out;
}
