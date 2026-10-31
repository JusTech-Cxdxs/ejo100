import 'server-only';
/**
 * The integrity watch's scan for one organisation: runs every check over the
 * recent window and records each finding as an alert (one per check and
 * record — a later scan only updates "last seen"). Reviewed alerts keep their
 * status. Organisation-fenced throughout; amounts and record numbers only,
 * never message text. Run daily by the scheduler and on demand by a reviewer.
 */
import { prisma, Prisma } from '@ejo/database';
import { logFailure } from '@/lib/log';
import { supportSettings } from '@/lib/support/server';
import {
  afterHours, benford, dailySeries, moneySeverity, naira, sameName, spike, splitGroups,
  type Finding,
} from './core';

const DAY = 86_400_000;
const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d));
const SENSITIVE_ACTIONS = /^(refund\.recorded|payment\.(recorded|approved)|external_procurement\.(approved|disbursed)|part_request_slip\.(released|approved|store_approved|hod_approved)|cancellation\.approved|vehicle_service\.cancellation_approved|customer\.switched_on|user\.(role_assigned|reactivated)|exit_pass\.(approved|issued)|estimate\.(approved|manager_approved)|warranty_claim\.(approved|settled))$/;

export type ScanResult = { findings: number; created: number; updated: number; rules: Record<string, number>; ms: number };

/** `deadline`: checks that would start after it are skipped (the next run catches up — every check looks back a week). */
export async function scanOrganisation(organisationId: string, windowDays = 7, deadline = Number.POSITIVE_INFINITY): Promise<ScanResult> {
  const started = Date.now();
  const since = new Date(Date.now() - windowDays * DAY);
  const orgJob = { branch: { businessUnit: { organisationId } } };
  const findings: Finding[] = [];
  const settings = await supportSettings(organisationId);
  const safe = async (name: string, fn: () => Promise<void>) => {
    if (Date.now() > deadline - 6_000) return;
    try { await fn(); } catch (err) { logFailure(`Integrity check ${name} failed`, err); }
  };

  // 1. Same person asked and approved ───────────────────────────────────
  await safe('same_person_approval', async () => {
    const prs = await prisma.partRequestSlip.findMany({
      where: { ...orgJob, createdAt: { gte: since }, OR: [{ hodApprovedById: { not: null } }, { storeApprovedById: { not: null } }] },
      select: { id: true, referenceNumber: true, branchId: true, requestedById: true, hodApprovedById: true, storeApprovedById: true }, take: 2000,
    });
    for (const s of prs) {
      const roles = [s.hodApprovedById === s.requestedById ? 'head of department' : null, s.storeApprovedById === s.requestedById ? 'store' : null].filter(Boolean);
      if (roles.length) findings.push({ rule: 'same_person_approval', severity: 'MEDIUM', title: `Parts slip ${s.referenceNumber}: requested and approved (${roles.join(' and ')}) by the same person`, evidence: { record: s.referenceNumber, stages: roles }, entityType: 'PartRequestSlip', entityId: s.id, subjectUserId: s.requestedById, branchId: s.branchId, fingerprint: `spa:prs:${s.id}` });
    }
    const epr = await prisma.externalProcurementRequest.findMany({
      where: { ...orgJob, createdAt: { gte: since }, OR: [{ financeReviewedById: { not: null } }, { managerApprovedById: { not: null } }, { disbursedById: { not: null } }] },
      select: { id: true, referenceNumber: true, branchId: true, requestedById: true, financeReviewedById: true, managerApprovedById: true, disbursedById: true, estimatedAmount: true, approvedTotal: true, disbursedAmount: true }, take: 2000,
    });
    for (const e of epr) {
      const roles = [e.financeReviewedById === e.requestedById ? 'finance review' : null, e.managerApprovedById === e.requestedById ? 'manager approval' : null, e.disbursedById === e.requestedById ? 'payout' : null].filter(Boolean);
      const amount = num(e.disbursedAmount ?? e.approvedTotal ?? e.estimatedAmount);
      if (roles.length) findings.push({ rule: 'same_person_approval', severity: moneySeverity(amount, 'MEDIUM'), title: `Outside purchase ${e.referenceNumber} (${naira(amount)}): requested and passed ${roles.join(', ')} by the same person`, evidence: { record: e.referenceNumber, stages: roles, amount }, entityType: 'ExternalProcurementRequest', entityId: e.id, subjectUserId: e.requestedById, branchId: e.branchId, fingerprint: `spa:epr:${e.id}` });
      // Allowed (the manager's approval sits between), but worth a look: the same Finance colleague reviewed and paid it out.
      if (e.disbursedById && e.financeReviewedById && e.disbursedById === e.financeReviewedById && e.disbursedById !== e.requestedById) findings.push({ rule: 'same_person_approval', severity: moneySeverity(amount, 'LOW'), title: `Outside purchase ${e.referenceNumber} (${naira(amount)}): reviewed and paid out by the same Finance colleague`, evidence: { record: e.referenceNumber, stages: ['finance review', 'payout'], amount }, entityType: 'ExternalProcurementRequest', entityId: e.id, subjectUserId: e.disbursedById, branchId: e.branchId, fingerprint: `spa:epr-review-pay:${e.id}` });
      if (e.disbursedAmount && e.approvedTotal && num(e.disbursedAmount) > num(e.approvedTotal) * 1.001) {
        findings.push({ rule: 'epr_over_estimate', severity: moneySeverity(num(e.disbursedAmount) - num(e.approvedTotal), 'MEDIUM'), title: `Outside purchase ${e.referenceNumber}: paid ${naira(num(e.disbursedAmount))}, approved ${naira(num(e.approvedTotal))}`, evidence: { record: e.referenceNumber, paid: num(e.disbursedAmount), approved: num(e.approvedTotal) }, entityType: 'ExternalProcurementRequest', entityId: e.id, subjectUserId: e.disbursedById, branchId: e.branchId, fingerprint: `epr-over:${e.id}` });
      }
    }
    const cancels = await prisma.cancellationRequest.findMany({ where: { jobCard: orgJob, decidedAt: { gte: since } }, select: { id: true, requestedById: true, decidedById: true, jobCard: { select: { id: true, jobNumber: true, branchId: true } } }, take: 2000 });
    for (const c of cancels) {
      if (c.decidedById && c.decidedById === c.requestedById) findings.push({ rule: 'same_person_approval', severity: 'MEDIUM', title: `Job Card ${c.jobCard.jobNumber}: cancellation asked for and decided by the same person`, evidence: { record: c.jobCard.jobNumber }, entityType: 'JobCard', entityId: c.jobCard.id, subjectUserId: c.requestedById, branchId: c.jobCard.branchId, fingerprint: `spa:cancel:${c.id}` });
    }
    const claims = await prisma.warrantyClaim.findMany({
      where: { customer: { organisationId }, createdAt: { gte: new Date(Date.now() - 90 * DAY) } },
      select: { id: true, claimNumber: true, createdById: true, hodApprovedById: true, managerApprovedById: true, claimedAmount: true, vehicleId: true, failureDate: true, createdAt: true, warranty: { select: { endsAt: true } } }, take: 3000,
    });
    for (const c of claims) {
      if (c.createdAt >= since && (c.hodApprovedById === c.createdById || c.managerApprovedById === c.createdById)) {
        findings.push({ rule: 'warranty_self_created_approved', severity: moneySeverity(num(c.claimedAmount), 'MEDIUM'), title: `Warranty claim ${c.claimNumber} (${naira(num(c.claimedAmount))}) approved by the person who wrote it`, evidence: { record: c.claimNumber, amount: num(c.claimedAmount) }, entityType: 'WarrantyClaim', entityId: c.id, subjectUserId: c.createdById, fingerprint: `wc-self:${c.id}` });
      }
      const left = (c.warranty.endsAt.getTime() - c.failureDate.getTime()) / DAY;
      if (c.createdAt >= since && left >= 0 && left <= 14) {
        findings.push({ rule: 'warranty_near_expiry', severity: 'LOW', title: `Warranty claim ${c.claimNumber}: failure ${Math.round(left)} day${Math.round(left) === 1 ? '' : 's'} before the warranty ended`, evidence: { record: c.claimNumber, daysBeforeEnd: Math.round(left) }, entityType: 'WarrantyClaim', entityId: c.id, subjectUserId: c.createdById, fingerprint: `wc-expiry:${c.id}` });
      }
    }
    // Repeat claims on one vehicle within 90 days.
    const byVehicle = new Map<string, typeof claims>();
    for (const c of claims) if (c.vehicleId) byVehicle.set(c.vehicleId, [...(byVehicle.get(c.vehicleId) ?? []), c]);
    for (const [vehicleId, list] of byVehicle) {
      if (list.length < 2 || !list.some((c) => c.createdAt >= since)) continue;
      const sorted = [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const total = sorted.reduce((a, c) => a + num(c.claimedAmount), 0);
      findings.push({ rule: 'warranty_repeat_vehicle', severity: list.length >= 3 ? 'HIGH' : moneySeverity(total, 'LOW'), title: `${list.length} warranty claims on one vehicle in 90 days (${naira(total)})`, evidence: { claims: sorted.map((c) => c.claimNumber), total }, entityType: 'CustomerVehicle', entityId: vehicleId, subjectUserId: sorted[sorted.length - 1]!.createdById, fingerprint: `wc-repeat:${vehicleId}:${sorted[sorted.length - 1]!.id}` });
    }
  });

  // 2. Money: refunds and out-of-hours ─────────────────────────────────
  await safe('money', async () => {
    const refunds = await prisma.refund.findMany({
      where: { recordedAt: { gte: since }, OR: [{ jobCard: orgJob }, { vehicleService: orgJob }] },
      select: {
        id: true, referenceNumber: true, amount: true, paidToName: true, recordedAt: true, recordedById: true, jobCardId: true, vehicleServiceId: true,
        jobCard: { select: { jobNumber: true, branchId: true, customer: { select: { fullName: true } } } },
        vehicleService: { select: { serviceNumber: true, branchId: true, customer: { select: { fullName: true } } } },
      }, take: 3000,
    });
    // Totals per job, and cash payments near each refund — a few grouped queries, not three per refund.
    const jobIds = [...new Set(refunds.map((r) => r.jobCardId).filter((x): x is string => Boolean(x)))];
    const svcIds = [...new Set(refunds.map((r) => r.vehicleServiceId).filter((x): x is string => Boolean(x)))];
    const [paidJ, paidS, refJ, refS, cashRows] = await Promise.all([
      jobIds.length ? prisma.payment.groupBy({ by: ['jobCardId'], where: { jobCardId: { in: jobIds } }, _sum: { amount: true } }) : [],
      svcIds.length ? prisma.payment.groupBy({ by: ['vehicleServiceId'], where: { vehicleServiceId: { in: svcIds } }, _sum: { amount: true } }) : [],
      jobIds.length ? prisma.refund.groupBy({ by: ['jobCardId'], where: { jobCardId: { in: jobIds } }, _sum: { amount: true } }) : [],
      svcIds.length ? prisma.refund.groupBy({ by: ['vehicleServiceId'], where: { vehicleServiceId: { in: svcIds } }, _sum: { amount: true } }) : [],
      jobIds.length || svcIds.length ? prisma.payment.findMany({ where: { method: 'CASH', recordedAt: { gte: new Date(since.getTime() - DAY) }, OR: [{ jobCardId: { in: jobIds } }, { vehicleServiceId: { in: svcIds } }] }, select: { jobCardId: true, vehicleServiceId: true, amount: true, recordedAt: true, recordedById: true }, take: 20_000 }) : [],
    ]);
    const paidOf = new Map<string, number>([...paidJ.map((p) => [`j:${p.jobCardId}`, num(p._sum.amount)] as const), ...paidS.map((p) => [`s:${p.vehicleServiceId}`, num(p._sum.amount)] as const)]);
    const refundedOf = new Map<string, number>([...refJ.map((p) => [`j:${p.jobCardId}`, num(p._sum.amount)] as const), ...refS.map((p) => [`s:${p.vehicleServiceId}`, num(p._sum.amount)] as const)]);
    for (const r of refunds) {
      const job = r.jobCard ?? r.vehicleService;
      const number = r.jobCard?.jobNumber ?? r.vehicleService?.serviceNumber ?? '';
      const key = r.jobCardId ? `j:${r.jobCardId}` : `s:${r.vehicleServiceId}`;
      const paid = { _sum: { amount: paidOf.get(key) ?? 0 } };
      const refunded = { _sum: { amount: refundedOf.get(key) ?? 0 } };
      const cash = cashRows.find((c) => (r.jobCardId ? c.jobCardId === r.jobCardId : c.vehicleServiceId === r.vehicleServiceId) && c.recordedAt <= r.recordedAt && c.recordedAt.getTime() >= r.recordedAt.getTime() - DAY) ?? null;
      const amount = num(r.amount);
      if (num(refunded._sum.amount) > num(paid._sum.amount) + 0.01) {
        findings.push({ rule: 'refund_exceeds_paid', severity: 'HIGH', title: `${number}: refunded ${naira(num(refunded._sum.amount))}, paid ${naira(num(paid._sum.amount))}`, evidence: { record: number, refund: r.referenceNumber, refunded: num(refunded._sum.amount), paid: num(paid._sum.amount) }, entityType: r.jobCardId ? 'JobCard' : 'VehicleService', entityId: r.jobCardId ?? r.vehicleServiceId, subjectUserId: r.recordedById, branchId: job?.branchId ?? null, fingerprint: `refund-over:${r.jobCardId ?? r.vehicleServiceId}` });
      }
      if (cash) findings.push({ rule: 'refund_after_cash', severity: moneySeverity(amount, 'MEDIUM'), title: `Refund ${r.referenceNumber} (${naira(amount)}) within 24 hours of a cash payment on ${number}`, evidence: { record: number, refund: r.referenceNumber, refundAmount: amount, cashAmount: num(cash.amount), samePerson: cash.recordedById === r.recordedById }, entityType: 'Refund', entityId: r.id, subjectUserId: r.recordedById, branchId: job?.branchId ?? null, fingerprint: `refund-cash:${r.id}` });
      const customer = job?.customer?.fullName ?? '';
      if (customer && r.paidToName && !sameName(r.paidToName, customer)) findings.push({ rule: 'refund_other_name', severity: moneySeverity(amount, 'LOW'), title: `Refund ${r.referenceNumber} (${naira(amount)}) paid to a name that is not the customer’s`, evidence: { record: number, refund: r.referenceNumber, paidTo: r.paidToName.slice(0, 80), customer: customer.slice(0, 80), amount }, entityType: 'Refund', entityId: r.id, subjectUserId: r.recordedById, branchId: job?.branchId ?? null, fingerprint: `refund-name:${r.id}` });
      if (afterHours(r.recordedAt, settings.hours, settings.holidays)) findings.push({ rule: 'money_after_hours', severity: moneySeverity(amount, 'LOW'), title: `Refund ${r.referenceNumber} (${naira(amount)}) recorded out of hours`, evidence: { refund: r.referenceNumber, at: r.recordedAt.toISOString(), amount }, entityType: 'Refund', entityId: r.id, subjectUserId: r.recordedById, branchId: job?.branchId ?? null, fingerprint: `hours:refund:${r.id}` });
    }
    const payouts = await prisma.externalProcurementRequest.findMany({ where: { ...orgJob, disbursedAt: { gte: since } }, select: { id: true, referenceNumber: true, disbursedAt: true, disbursedById: true, disbursedAmount: true, branchId: true }, take: 2000 });
    for (const e of payouts) {
      if (e.disbursedAt && afterHours(e.disbursedAt, settings.hours, settings.holidays)) findings.push({ rule: 'money_after_hours', severity: moneySeverity(num(e.disbursedAmount), 'LOW'), title: `Outside purchase ${e.referenceNumber} paid out out of hours (${naira(num(e.disbursedAmount))})`, evidence: { record: e.referenceNumber, at: e.disbursedAt.toISOString(), amount: num(e.disbursedAmount) }, entityType: 'ExternalProcurementRequest', entityId: e.id, subjectUserId: e.disbursedById, branchId: e.branchId, fingerprint: `hours:epr:${e.id}` });
    }
  });

  // 3. Split purchases (outside purchases by one person within 48 hours) ─
  await safe('split_purchases', async () => {
    const recent = await prisma.externalProcurementRequest.findMany({ where: { ...orgJob, createdAt: { gte: new Date(Date.now() - 120 * DAY) } }, select: { id: true, referenceNumber: true, createdAt: true, estimatedAmount: true, requestedById: true, branchId: true }, take: 5000 });
    if (recent.length < 20) return;
    // "Usually one purchase": the 90th percentile of single purchases is the line splitting would avoid.
    const amounts = recent.map((r) => num(r.estimatedAmount)).filter((a) => a > 0).sort((a, b) => a - b);
    const p90 = amounts[Math.floor(amounts.length * 0.9)] ?? 0;
    if (p90 <= 0) return;
    const ref = new Map(recent.map((r) => [r.id, r]));
    for (const g of splitGroups(recent.filter((r) => r.createdAt >= since).map((r) => ({ id: r.id, at: r.createdAt, amount: num(r.estimatedAmount), by: r.requestedById })), p90)) {
      findings.push({ rule: 'split_purchases', severity: moneySeverity(g.total, 'MEDIUM'), title: `${g.ids.length} outside purchases within 48 hours by one person, ${naira(g.total)} together (a single one is usually under ${naira(p90)})`, evidence: { records: g.ids.map((id) => ref.get(id)?.referenceNumber), total: g.total, usualTop: p90 }, entityType: 'ExternalProcurementRequest', entityId: g.ids[0]!, subjectUserId: g.by, branchId: ref.get(g.ids[0]!)?.branchId ?? null, fingerprint: `split:${g.by}:${[...g.ids].sort()[0]}` });
    }
  });

  // 4. Gate exits ────────────────────────────────────────────────────────
  await safe('gate', async () => {
    const exits = await prisma.vehicleGateExit.findMany({
      where: { branch: { businessUnit: { organisationId } }, exitedAt: { gte: since } },
      select: { id: true, exitNumber: true, exitedAt: true, exitedById: true, branchId: true, jobCard: { select: { jobNumber: true, status: true } }, vehicleService: { select: { serviceNumber: true, status: true } } }, take: 3000,
    });
    for (const x of exits) {
      const open = x.jobCard ? !['CLOSED', 'CHECKED_OUT', 'CANCELLED'].includes(String(x.jobCard.status)) : x.vehicleService ? !['CLOSED', 'COLLECTED', 'CANCELLED', 'ESCALATED'].includes(String(x.vehicleService.status)) : false;
      if (open) findings.push({ rule: 'gate_exit_open_work', severity: 'HIGH', title: `Gate exit ${x.exitNumber}: ${x.jobCard?.jobNumber ?? x.vehicleService?.serviceNumber} was not closed when the vehicle left`, evidence: { exit: x.exitNumber, record: x.jobCard?.jobNumber ?? x.vehicleService?.serviceNumber, status: String(x.jobCard?.status ?? x.vehicleService?.status) }, entityType: 'VehicleGateExit', entityId: x.id, subjectUserId: x.exitedById, branchId: x.branchId, fingerprint: `gate-open:${x.id}` });
      if (afterHours(x.exitedAt, settings.hours, settings.holidays)) findings.push({ rule: 'gate_exit_after_hours', severity: 'MEDIUM', title: `Gate exit ${x.exitNumber} out of hours`, evidence: { exit: x.exitNumber, at: x.exitedAt.toISOString() }, entityType: 'VehicleGateExit', entityId: x.id, subjectUserId: x.exitedById, branchId: x.branchId, fingerprint: `gate-hours:${x.id}` });
    }
  });

  // 5. Access: password guessing, bank details, administrator roles ───────
  await safe('access', async () => {
    const dayAgo = new Date(Date.now() - DAY);
    for (const action of ['user.sign_in_failed', 'customer.sign_in_failed'] as const) {
      const rows = await prisma.auditLog.groupBy({ by: ['entityId'], where: { organisationId, action, createdAt: { gte: dayAgo }, entityId: { not: null } }, _count: { _all: true } });
      for (const r of rows) {
        if (r._count._all < 10 || !r.entityId) continue;
        const staff = action === 'user.sign_in_failed';
        findings.push({ rule: 'password_guessing', severity: staff ? 'HIGH' : 'MEDIUM', title: `${r._count._all} failed sign-ins in a day on a ${staff ? 'staff' : 'customer'} account`, evidence: { attempts: r._count._all, account: staff ? 'staff' : 'customer' }, entityType: staff ? 'User' : 'Customer', entityId: r.entityId, fingerprint: `guess:${r.entityId}:${new Date().toISOString().slice(0, 10)}` });
      }
    }
    const events = await prisma.auditLog.findMany({ where: { organisationId, createdAt: { gte: since }, action: { in: ['branch.bank_details_changed', 'user.role_assigned'] } }, select: { id: true, action: true, userId: true, entityId: true, metadata: true, createdAt: true }, take: 500 });
    for (const e of events) {
      const meta = (e.metadata && typeof e.metadata === 'object' ? e.metadata : {}) as Record<string, unknown>;
      if (e.action === 'branch.bank_details_changed') findings.push({ rule: 'bank_details_changed', severity: 'MEDIUM', title: 'A branch’s bank details were changed', evidence: { at: e.createdAt.toISOString() }, entityType: 'Branch', entityId: e.entityId, subjectUserId: e.userId, fingerprint: `bank:${e.id}` });
      else if (typeof meta.role === 'string' && /admin/i.test(meta.role)) findings.push({ rule: 'admin_role_given', severity: 'MEDIUM', title: `Administrator role given${typeof meta.person === 'string' ? ` to ${meta.person.slice(0, 80)}` : ''}`, evidence: { role: meta.role, at: e.createdAt.toISOString() }, entityType: 'User', entityId: e.entityId, subjectUserId: e.userId, fingerprint: `admin-role:${e.id}` });
    }
  });

  // 6. Colleagues who are also customers, working on their own jobs ────────
  await safe('own_vehicle_work', async () => {
    const staff = await prisma.user.findMany({ where: { organisationId, isActive: true }, select: { id: true, email: true }, take: 5000 });
    const emails = staff.map((s) => s.email.toLowerCase());
    if (!emails.length) return;
    const customers = await prisma.customer.findMany({ where: { organisationId, email: { in: emails, mode: 'insensitive' } }, select: { id: true, email: true } });
    const staffOf = new Map(staff.map((s) => [s.email.toLowerCase(), s.id]));
    if (!customers.length) return;
    const userOf = new Map(customers.map((c) => [c.id, c.email ? staffOf.get(c.email.toLowerCase()) : undefined]));
    const custIds = customers.map((c) => c.id);
    const users = [...new Set([...userOf.values()].filter((x): x is string => Boolean(x)))];
    const onOwn = { OR: [{ jobCard: { customerId: { in: custIds } } }, { vehicleService: { customerId: { in: custIds } } }] };
    const owner = { jobCard: { select: { customerId: true } }, vehicleService: { select: { customerId: true } } } as const;
    const [payments, refunds, approvals] = await Promise.all([
      prisma.payment.findMany({ where: { recordedById: { in: users }, recordedAt: { gte: since }, ...onOwn }, select: { id: true, amount: true, recordedById: true, ...owner }, take: 2000 }),
      prisma.refund.findMany({ where: { recordedById: { in: users }, recordedAt: { gte: since }, ...onOwn }, select: { id: true, amount: true, recordedById: true, ...owner }, take: 2000 }),
      prisma.jobCard.findMany({ where: { approvedById: { in: users }, approvedAt: { gte: since }, customerId: { in: custIds } }, select: { id: true, jobNumber: true, approvedById: true, customerId: true }, take: 2000 }),
    ]);
    const own = (by: string | null, customerId: string | null | undefined) => Boolean(by && customerId && userOf.get(customerId) === by);
    // One alert per record: the same payment, refund or approval never raises a second one on a later day.
    for (const p of payments) {
      const cid = p.jobCard?.customerId ?? p.vehicleService?.customerId;
      if (own(p.recordedById, cid)) findings.push({ rule: 'own_vehicle_work', severity: moneySeverity(num(p.amount), 'MEDIUM'), title: `A colleague recorded a payment (${naira(num(p.amount))}) on their own vehicle`, evidence: { kind: 'payment', amount: num(p.amount) }, entityType: 'Customer', entityId: cid ?? null, subjectUserId: p.recordedById, fingerprint: `own:payment:${p.id}` });
    }
    for (const r of refunds) {
      const cid = r.jobCard?.customerId ?? r.vehicleService?.customerId;
      if (own(r.recordedById, cid)) findings.push({ rule: 'own_vehicle_work', severity: 'HIGH', title: `A colleague recorded a refund (${naira(num(r.amount))}) on their own vehicle`, evidence: { kind: 'refund', amount: num(r.amount) }, entityType: 'Refund', entityId: r.id, subjectUserId: r.recordedById, fingerprint: `own:refund:${r.id}` });
    }
    for (const a of approvals) {
      if (own(a.approvedById, a.customerId)) findings.push({ rule: 'own_vehicle_work', severity: 'MEDIUM', title: `A colleague approved Job Card ${a.jobNumber} for their own vehicle`, evidence: { kind: 'approval', record: a.jobNumber }, entityType: 'JobCard', entityId: a.id, subjectUserId: a.approvedById, fingerprint: `own:approval:${a.id}` });
    }
  });

  // 7. Activity spikes (modified z-score against the person's own 60 days) ─
  await safe('activity_spike', async () => {
    const rows = await prisma.$queryRaw<{ userId: string; action: string; createdAt: Date }[]>(Prisma.sql`
      SELECT "userId", "action", "createdAt" FROM "audit_logs"
      WHERE "organisationId" = ${organisationId} AND "userId" IS NOT NULL AND "createdAt" >= ${new Date(Date.now() - 61 * DAY)}
        AND "action" ~ ${SENSITIVE_ACTIONS.source}
      LIMIT 200000`);
    const byUser = new Map<string, Date[]>();
    for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), new Date(r.createdAt)]);
    for (const [userId, dates] of byUser) {
      const series = dailySeries(dates, 61);
      const today = series[series.length - 1]!;
      const history = series.slice(0, -1);
      if (history.filter((x) => x > 0).length < 10) continue; // not enough of a baseline yet
      const s = spike(today, history);
      if (s.spike) findings.push({ rule: 'activity_spike', severity: s.z > 8 ? 'HIGH' : 'MEDIUM', title: `${today} sensitive actions in the last day — usually about ${Math.round(s.usual)}`, evidence: { today, usual: s.usual, z: s.z }, entityType: 'User', entityId: userId, subjectUserId: userId, score: s.z, fingerprint: `spike:${userId}:${new Date().toISOString().slice(0, 10)}` });
    }
  });

  // 8. Benford on a year of payments (only with 1,000 or more) ───────────
  await safe('benford', async () => {
    const pays = await prisma.payment.findMany({ where: { recordedAt: { gte: new Date(Date.now() - 365 * DAY) }, OR: [{ jobCard: orgJob }, { vehicleService: orgJob }] }, select: { amount: true }, take: 50_000 });
    const b = benford(pays.map((p) => num(p.amount)));
    if (b && (b.band === 'marginal' || b.band === 'nonconformity')) {
      findings.push({ rule: 'benford_payments', severity: b.band === 'nonconformity' ? 'MEDIUM' : 'LOW', title: `Payment amounts over the last year ${b.band === 'nonconformity' ? 'do not follow' : 'only loosely follow'} the natural first-digit pattern (${b.n} payments)`, evidence: { n: b.n, mad: b.mad, band: b.band, observed: b.observed.map((x) => Math.round(x * 1000) / 1000) }, score: b.mad, fingerprint: `benford:${new Date().toISOString().slice(0, 7)}` });
    }
  });

  // Record: one alert per finding (by fingerprint); reviewed alerts keep their status.
  let created = 0;
  let updated = 0;
  const rules: Record<string, number> = {};
  for (const f of findings) {
    rules[f.rule] = (rules[f.rule] ?? 0) + 1;
    const existing = await prisma.integrityAlert.findUnique({ where: { organisationId_fingerprint: { organisationId, fingerprint: f.fingerprint } }, select: { id: true } });
    if (existing) {
      await prisma.integrityAlert.update({ where: { id: existing.id }, data: { lastSeenAt: new Date(), seenCount: { increment: 1 }, evidence: f.evidence as Prisma.InputJsonValue, ...(f.score !== undefined ? { score: f.score } : {}) } });
      updated += 1;
    } else {
      const row = await prisma.integrityAlert.create({
        data: { organisationId, rule: f.rule, severity: f.severity, title: f.title.slice(0, 300), evidence: f.evidence as Prisma.InputJsonValue, entityType: f.entityType ?? null, entityId: f.entityId ?? null, subjectUserId: f.subjectUserId ?? null, branchId: f.branchId ?? null, fingerprint: f.fingerprint, score: f.score ?? null },
        select: { id: true },
      }).catch((err: unknown) => (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' ? null : Promise.reject(err)));
      if (row) {
        created += 1;
        await prisma.auditLog.create({ data: { organisationId, userId: null, action: 'integrity.alert_raised', entityType: 'IntegrityAlert', entityId: row.id, metadata: { rule: f.rule, severity: f.severity } } }).catch(() => undefined);
      }
    }
  }
  return { findings: findings.length, created, updated, rules, ms: Date.now() - started };
}

/**
 * Due between 1 and 5 am Lagos time unless today's scan is complete. A scan
 * that ran out of time leaves a cursor (the last organisation done) and the
 * next run carries on from it.
 */
export async function integrityScanDue(now = new Date()): Promise<{ due: boolean; after: string | null }> {
  const hour = Number(now.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', hour12: false }));
  if (hour < 1 || hour >= 5) return { due: false, after: null };
  const last = await prisma.auditLog.findFirst({ where: { action: 'system.job_run', entityType: 'ScheduledJob', entityId: 'integrity-scan', createdAt: { gte: new Date(now.getTime() - 20 * 3_600_000) } }, orderBy: { createdAt: 'desc' }, select: { metadata: true } });
  const meta = (last?.metadata && typeof last.metadata === 'object' ? last.metadata : {}) as { complete?: unknown; next?: unknown };
  if (last && meta.complete === true) return { due: false, after: null };
  return { due: true, after: typeof meta.next === 'string' ? meta.next : null };
}

/** Organisations in id order from after `after`, within the budget; `next` is where the next run carries on. */
export async function scanAllOrganisations(budgetMs: number, after: string | null = null): Promise<{ organisations: number; created: number; findings: number; complete: boolean; next: string | null }> {
  const deadline = Date.now() + budgetMs;
  const orgs = await prisma.organisation.findMany({ where: after ? { id: { gt: after } } : {}, select: { id: true }, orderBy: { id: 'asc' }, take: 500 });
  let n = 0;
  let created = 0;
  let found = 0;
  let next: string | null = after;
  for (const o of orgs) {
    if (Date.now() > deadline - 15_000) return { organisations: n, created, findings: found, complete: false, next };
    const r = await scanOrganisation(o.id, 7, deadline).catch((err) => { logFailure('Integrity scan failed', err); return null; });
    if (r) {
      n += 1; created += r.created; found += r.findings;
      // One "integrity.scan" entry per organisation, so its page shows when it was last checked.
      await prisma.auditLog.create({ data: { organisationId: o.id, userId: null, action: 'integrity.scan', entityType: 'IntegrityAlert', metadata: { findings: r.findings, created: r.created, ms: r.ms, scheduled: true } } }).catch(() => undefined);
    }
    next = o.id;
  }
  return { organisations: n, created, findings: found, complete: orgs.length < 500, next: orgs.length < 500 ? null : next };
}
