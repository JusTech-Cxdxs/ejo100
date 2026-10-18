'use server';

import { prisma } from '@ejo/database';
import { getPrincipal } from '@/lib/authz/server';
import { SENIOR_REQUESTER_SLUGS, nameWithRole } from '@/lib/authz/catalogue';
import { requireUser, listEligibleManagersForBranch, listEligibleFinanceOfficersForBranch } from './workshop';

/**
 * "Waiting on others": everything this person asked for that is still with
 * someone else — a Job Card waiting for its supervisor, an estimate for the
 * supervisor or the Manager, a parts request for the Manager or the Store, an
 * outside purchase for Finance or the Manager, an exit pass for the head or
 * the Manager, a warranty claim, a close or cancel request, a road test, a
 * help request. Each names who it is waiting on (name and role) and since
 * when. The person's own records only; nothing about anyone else's.
 */
export type PendingItem = { id: string; area: string; number: string; title: string; waitingOn: string; since: Date; url: string };

const JC_CLOSED = ['CLOSED', 'CHECKED_OUT', 'CANCELLED'] as const;
const SV_CLOSED = ['CLOSED', 'COLLECTED', 'CANCELLED', 'ESCALATED'] as const;

export async function getMyPending(): Promise<PendingItem[]> {
  const me = await requireUser();
  const p = await getPrincipal();
  const mine = me.id;
  const [jcs, svs, ests, svEsts, prs, eprs, passes, claims, closes, cancels, svCloses, svCancels, tests, help, contractors] = await Promise.all([
    prisma.jobCard.findMany({ where: { createdById: mine, approvalStatus: 'PENDING', status: { notIn: [...JC_CLOSED] } }, take: 30, select: { id: true, jobNumber: true, createdAt: true, branchId: true, supervisor: { select: { id: true, fullName: true } } } }),
    prisma.vehicleService.findMany({ where: { createdById: mine, approvalStatus: 'PENDING', status: { notIn: [...SV_CLOSED] } }, take: 30, select: { id: true, serviceNumber: true, createdAt: true, branchId: true, supervisor: { select: { id: true, fullName: true } } } }),
    prisma.estimate.findMany({ where: { createdById: mine, status: { in: ['SUBMITTED', 'APPROVED'] }, jobCard: { status: { notIn: [...JC_CLOSED] } } }, take: 30, select: { status: true, submittedAt: true, approvedAt: true, updatedAt: true, jobCard: { select: { id: true, jobNumber: true, branchId: true, supervisor: { select: { id: true, fullName: true } } } } } }),
    prisma.serviceEstimate.findMany({ where: { createdById: mine, status: { in: ['SUBMITTED', 'APPROVED'] }, vehicleService: { status: { notIn: [...SV_CLOSED] } } }, take: 30, select: { status: true, submittedAt: true, approvedAt: true, updatedAt: true, vehicleService: { select: { id: true, serviceNumber: true, branchId: true, supervisor: { select: { id: true, fullName: true } } } } } }),
    prisma.partRequestSlip.findMany({ where: { requestedById: mine, status: { in: ['PENDING_HOD_APPROVAL', 'PENDING_STORE_APPROVAL', 'APPROVED'] } }, take: 30, select: { id: true, referenceNumber: true, status: true, branchId: true, createdAt: true, hodApprovedAt: true, storeApprovedAt: true } }),
    prisma.externalProcurementRequest.findMany({ where: { requestedById: mine, status: { in: ['PENDING_FINANCE_REVIEW', 'PENDING_MANAGER_APPROVAL', 'APPROVED'] } }, take: 30, select: { id: true, referenceNumber: true, status: true, branchId: true, createdAt: true, financeReviewedAt: true, managerApprovedAt: true } }),
    prisma.exitPass.findMany({ where: { requestedById: mine, status: { in: ['PENDING_HEAD', 'PENDING_MANAGER'] } }, take: 20, select: { id: true, passNumber: true, status: true, branchId: true, createdAt: true, headApprovedAt: true } }),
    prisma.warrantyClaim.findMany({ where: { createdById: mine, status: { in: ['PENDING_HOD', 'PENDING_MANAGER', 'SUBMITTED'] } }, take: 20, select: { id: true, claimNumber: true, status: true, createdAt: true, reviewRequestedAt: true, submittedAt: true } }),
    prisma.closeRequest.findMany({ where: { requestedById: mine, status: 'PENDING' }, take: 20, select: { requestedAt: true, jobCard: { select: { id: true, jobNumber: true, branchId: true } } } }),
    prisma.cancellationRequest.findMany({ where: { requestedById: mine, status: 'PENDING' }, take: 20, select: { requestedAt: true, jobCard: { select: { id: true, jobNumber: true, branchId: true } } } }),
    prisma.vehicleServiceCloseRequest.findMany({ where: { requestedById: mine, status: 'PENDING' }, take: 20, select: { requestedAt: true, vehicleService: { select: { id: true, serviceNumber: true, branchId: true } } } }),
    prisma.vehicleServiceCancellationRequest.findMany({ where: { requestedById: mine, status: 'PENDING' }, take: 20, select: { requestedAt: true, vehicleService: { select: { id: true, serviceNumber: true, branchId: true } } } }),
    prisma.roadTestPermit.findMany({ where: { requestedById: mine, status: 'PENDING_MANAGER' }, take: 20, select: { id: true, permitNumber: true, createdAt: true, branchId: true } }),
    p.organisationId ? prisma.supportTicket.findMany({ where: { organisationId: p.organisationId, requesterUserId: mine, status: { in: ['OPEN', 'WAITING_ON_CUSTOMER', 'ON_HOLD'] } }, take: 20, select: { id: true, number: true, subject: true, status: true, createdAt: true, assignedToId: true } }).catch(() => []) : [],
    prisma.contractorPass.findMany({ where: { requestedById: mine, status: 'PENDING_MANAGER' }, take: 20, select: { id: true, passNumber: true, company: true, createdAt: true, branchId: true } }),
  ]);

  // Who is "the Manager" or "Finance" in each branch, by name and role (once per branch).
  const managers = new Map<string, string>();
  const finance = new Map<string, string>();
  const names = (list: { id?: string; fullName: string }[], role: string, fallback: string) => {
    const xs = list.filter((x) => x.id !== mine).slice(0, 2).map((x) => `${x.fullName} (${role})`);
    return xs.length ? xs.join(' or ') : fallback;
  };
  const managerOf = async (branchId: string) => {
    if (!managers.has(branchId)) {
      const m = await listEligibleManagersForBranch(branchId).catch(() => ({ supervisors: [] as { id: string; fullName: string }[], usingFallback: true }));
      // No Manager in the branch yet (the fallback list is not Managers): say "the Manager", not someone else's name.
      const real = m.usingFallback ? [] : (m.supervisors as { id: string; fullName: string }[]).filter((x) => x.id !== mine);
      // No (other) Manager in the branch: it goes above, as the approvals do.
      managers.set(branchId, real.length ? names(real, 'Manager', 'the Manager') : await aboveMe());
    }
    return managers.get(branchId)!;
  };
  const financeOf = async (branchId: string) => {
    if (!finance.has(branchId)) finance.set(branchId, names((await listEligibleFinanceOfficersForBranch(branchId).catch(() => ({ supervisors: [] as { id: string; fullName: string }[] }))).supervisors as { id: string; fullName: string }[], 'Finance Officer', 'Finance'));
    return finance.get(branchId)!;
  };
  // A manager's or headquarters person's own pass goes up to the executives (see security.ts managerApprovers).
  const senior = SENIOR_REQUESTER_SLUGS.some((x) => p.roleSlugs.includes(x));
  // Managers and the Executive approve their own passes: anything of theirs still pending waits on them.
  const approvesOwn = p.isSuperAdmin || p.roleSlugs.includes('executive') || p.roleSlugs.includes('workshop-manager');
  const onMe = 'you — open it and approve it';
  let above: string | null = null;
  const aboveMe = async () => {
    if (above === null) {
      const execs = p.organisationId ? await prisma.user.findMany({ where: { organisationId: p.organisationId, isActive: true, id: { not: mine }, roles: { some: { role: { slug: 'executive' } } } }, take: 2, select: { fullName: true } }) : [];
      // As security.ts seniorApprovers: executives, else administrators.
      const admins = execs.length || !p.organisationId ? [] : await prisma.user.findMany({ where: { organisationId: p.organisationId, isActive: true, id: { not: mine }, roles: { some: { role: { slug: 'administrator' } } } }, take: 2, select: { fullName: true } });
      above = execs.length ? execs.map((e) => `${e.fullName} (Executive)`).join(' or ') : admins.length ? admins.map((e) => `${e.fullName} (Administrator)`).join(' or ') : 'the Executive';
    }
    return above;
  };
  const sup = (s: { id: string; fullName: string } | null) => (s ? (s.id === mine ? nameWithRole('', ['workshop-supervisor'], { isMe: true }) : `${s.fullName} (Supervisor)`) : 'a supervisor to be chosen');

  const helpers = new Map((help.length ? await prisma.user.findMany({ where: { id: { in: help.map((h) => h.assignedToId).filter((x): x is string => !!x) } }, select: { id: true, fullName: true } }) : []).map((u) => [u.id, u.fullName]));
  const out: PendingItem[] = [];
  for (const j of jcs) out.push({ id: `jc-${j.id}`, area: 'Workshop', number: j.jobNumber, title: 'Job Card waiting to be accepted', waitingOn: sup(j.supervisor), since: j.createdAt, url: `/workshop/job-cards/${j.id}` });
  for (const v of svs) out.push({ id: `sv-${v.id}`, area: 'Workshop', number: v.serviceNumber, title: 'Vehicle Service waiting to be accepted', waitingOn: sup(v.supervisor), since: v.createdAt, url: `/workshop/vehicle-service/${v.id}` });
  for (const e of ests) out.push(e.status === 'SUBMITTED'
    ? { id: `est-${e.jobCard.id}`, area: 'Workshop', number: e.jobCard.jobNumber, title: 'Estimate waiting for the supervisor’s check', waitingOn: sup(e.jobCard.supervisor), since: e.submittedAt ?? e.updatedAt, url: `/workshop/job-cards/${e.jobCard.id}` }
    : { id: `est-${e.jobCard.id}`, area: 'Workshop', number: e.jobCard.jobNumber, title: 'Estimate waiting for final approval', waitingOn: await managerOf(e.jobCard.branchId), since: e.approvedAt ?? e.updatedAt, url: `/workshop/job-cards/${e.jobCard.id}` });
  for (const e of svEsts) out.push(e.status === 'SUBMITTED'
    ? { id: `sest-${e.vehicleService.id}`, area: 'Workshop', number: e.vehicleService.serviceNumber, title: 'Service estimate waiting for the supervisor’s check', waitingOn: sup(e.vehicleService.supervisor), since: e.submittedAt ?? e.updatedAt, url: `/workshop/vehicle-service/${e.vehicleService.id}` }
    : { id: `sest-${e.vehicleService.id}`, area: 'Workshop', number: e.vehicleService.serviceNumber, title: 'Service estimate waiting for final approval', waitingOn: await managerOf(e.vehicleService.branchId), since: e.approvedAt ?? e.updatedAt, url: `/workshop/vehicle-service/${e.vehicleService.id}` });
  for (const s of prs) out.push({
    id: `prs-${s.id}`, area: 'Store', number: s.referenceNumber,
    title: s.status === 'PENDING_HOD_APPROVAL' ? 'Parts request waiting for the Manager' : s.status === 'PENDING_STORE_APPROVAL' ? 'Parts request waiting for the Store' : 'Parts approved — waiting to be released',
    waitingOn: s.status === 'PENDING_HOD_APPROVAL' ? await managerOf(s.branchId) : 'the Store (Store Manager or Store Officer)',
    since: s.storeApprovedAt ?? s.hodApprovedAt ?? s.createdAt, url: `/workshop/parts-requests/${s.id}`,
  });
  for (const e of eprs) out.push({
    id: `epr-${e.id}`, area: 'Purchasing', number: e.referenceNumber,
    title: e.status === 'PENDING_FINANCE_REVIEW' ? 'Outside purchase waiting for Finance review' : e.status === 'PENDING_MANAGER_APPROVAL' ? 'Outside purchase waiting for the Manager' : 'Outside purchase approved — waiting to be paid out',
    waitingOn: e.status === 'PENDING_MANAGER_APPROVAL' ? await managerOf(e.branchId) : await financeOf(e.branchId),
    since: e.managerApprovedAt ?? e.financeReviewedAt ?? e.createdAt, url: `/workshop/external-procurement/${e.id}`,
  });
  for (const x of passes) out.push({ id: `ep-${x.id}`, area: 'Security', number: x.passNumber, title: x.status === 'PENDING_HEAD' ? 'Exit pass waiting for your head of department' : 'Exit pass waiting for final approval', waitingOn: approvesOwn ? onMe : x.status === 'PENDING_HEAD' ? 'your head of department' : senior ? await aboveMe() : await managerOf(x.branchId), since: x.headApprovedAt ?? x.createdAt, url: `/security/exit-passes/${x.id}` });
  for (const c of claims) out.push({ id: `wc-${c.id}`, area: 'Warranty', number: c.claimNumber, title: c.status === 'PENDING_HOD' ? 'Warranty claim waiting for the Warranty HOD' : c.status === 'PENDING_MANAGER' ? 'Warranty claim waiting for the Manager' : 'Warranty claim with the provider', waitingOn: c.status === 'PENDING_HOD' ? 'the Warranty HOD' : c.status === 'PENDING_MANAGER' ? 'the Manager' : 'the warranty provider', since: c.submittedAt ?? c.reviewRequestedAt ?? c.createdAt, url: `/warranty/claims/${c.id}` });
  for (const c of closes) out.push({ id: `close-${c.jobCard.id}`, area: 'Workshop', number: c.jobCard.jobNumber, title: 'Close request waiting for approval', waitingOn: await managerOf(c.jobCard.branchId), since: c.requestedAt, url: `/workshop/job-cards/${c.jobCard.id}` });
  for (const c of cancels) out.push({ id: `cancel-${c.jobCard.id}`, area: 'Workshop', number: c.jobCard.jobNumber, title: 'Cancellation request waiting for approval', waitingOn: await managerOf(c.jobCard.branchId), since: c.requestedAt, url: `/workshop/job-cards/${c.jobCard.id}` });
  for (const c of svCloses) out.push({ id: `sclose-${c.vehicleService.id}`, area: 'Workshop', number: c.vehicleService.serviceNumber, title: 'Close request waiting for approval', waitingOn: await managerOf(c.vehicleService.branchId), since: c.requestedAt, url: `/workshop/vehicle-service/${c.vehicleService.id}` });
  for (const c of svCancels) out.push({ id: `scancel-${c.vehicleService.id}`, area: 'Workshop', number: c.vehicleService.serviceNumber, title: 'Cancellation request waiting for approval', waitingOn: await managerOf(c.vehicleService.branchId), since: c.requestedAt, url: `/workshop/vehicle-service/${c.vehicleService.id}` });
  for (const t of tests) out.push({ id: `rt-${t.id}`, area: 'Security', number: t.permitNumber, title: 'Road test waiting for approval', waitingOn: approvesOwn ? onMe : senior ? await aboveMe() : await managerOf(t.branchId), since: t.createdAt, url: `/security/road-tests/${t.id}` });
  for (const c of contractors) out.push({ id: `ctr-${c.id}`, area: 'Security', number: c.passNumber, title: `Contractor pass waiting for approval — ${c.company}`, waitingOn: approvesOwn ? onMe : senior ? await aboveMe() : await managerOf(c.branchId), since: c.createdAt, url: `/security/contractors/${c.id}` });
  for (const h of help) out.push({ id: `help-${h.id}`, area: 'Help', number: h.number, title: h.subject.slice(0, 80) || 'Help request', waitingOn: h.status === 'WAITING_ON_CUSTOMER' ? 'you — support asked you for more information' : h.assignedToId && helpers.get(h.assignedToId) ? `${helpers.get(h.assignedToId)} (Support)` : 'the support team', since: h.createdAt, url: `/support/help/${h.id}` });
  return out.sort((a, b) => a.since.getTime() - b.since.getTime());
}
