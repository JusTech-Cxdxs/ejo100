'use server';
import { logFailure } from '@/lib/log';
import { getServiceDashboardItems, getServiceGlance } from './service';
import { getProjectsDashboardItems, getProjectsGlance } from './projects';
import { getSalesDashboardItems, getSalesGlance } from './sales';
import { getProductionDashboardItems, getProductionGlance } from './production';
import { getWarehouseDashboardItems, getWarehouseGlance } from './warehouse';
import { getProcurementDashboardItems, getProcurementGlance } from './procurement';

import { countOpenIntegrityAlerts } from './integrity';
import { prisma } from '@ejo/database';
import { jobCardActive, serviceInside } from '@/lib/custody';
import { allows, getPrincipal, myOrganisationId, orgWhere, reachWhere } from '@/lib/authz/server';
import { STORE_COST_PERMISSIONS } from '@/lib/authz/catalogue';
import { reaches } from '@/lib/notification-rules';
import { getWarrantyDashboardItems } from './warranty';
import { getSecurityDashboardItems } from './security';
import { getWorkflowActionItems } from './workflow-actions';
import { getMyWorkItems } from './my-work';
import { getSchedulingDashboardItems } from './scheduling';
import { getWarrantyClaimDashboardItems } from './warranty-claims';
import { requireUser, currentUserIsMasterAdmin, listEligibleManagersForBranch } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';

export type DashboardNotification = {
  id: string;
  kind: 'PRICING_ALERT' | 'CANCELLATION_REQUEST' | 'CLOSE_REQUEST' | 'JOB_CARD_APPROVAL' | 'TECHNICIAN_ASSIGNMENT' | 'VEHICLE_SERVICE_APPROVAL' | 'WARRANTY' | 'SECURITY' | 'SCHEDULING' | 'WORKFLOW';
  title: string;
  detail: string;
  url: string;
  createdAt: Date;
};

/**
 * Pending items that need this viewer's attention: a Manager sees approvals
 * and requests waiting on them, a technician their pending assignments,
 * Master Admin everything pending in the branch.
 */
export async function getDashboardNotifications(): Promise<DashboardNotification[]> {
  try {
    return await getDashboardNotificationsInner();
  } catch (err) {
    // Every page's layout loads this, so a failure (a pending migration, a
    // database hiccup) shows no notifications instead of breaking navigation.
    logFailure('Failed to load dashboard notifications', err);
    return [];
  }
}

async function getDashboardNotificationsInner(): Promise<DashboardNotification[]> {
  const user = await requireUser();
  // Each module's items start now and run alongside the Workshop checks
  // below, so the wait is the slowest module, not the sum.
  const warrantyP = getWarrantyDashboardItems().catch(() => []);
  const claimsP = getWarrantyClaimDashboardItems().catch(() => []);
  const securityP = getSecurityDashboardItems().catch(() => []);
  const schedulingP = getSchedulingDashboardItems().catch(() => []);
  // Zinox edition: service centre and projects (the other modules are wired as they land).
  const serviceP = getServiceDashboardItems().catch(() => []);
  const projectsP = getProjectsDashboardItems().catch(() => []);
  const salesP = getSalesDashboardItems().catch(() => []);
  const productionP = getProductionDashboardItems().catch(() => []);
  const warehouseP = getWarehouseDashboardItems().catch(() => []);
  const procurementP = getProcurementDashboardItems().catch(() => []);
  const workflowP = getWorkflowActionItems().catch(() => []);
  const myWorkP = getMyWorkItems().catch(() => []);
  const isMasterAdmin = await currentUserIsMasterAdmin();
  const notifications: DashboardNotification[] = [];

  const fullUser = await prisma.user.findUnique({ where: { id: user.id }, select: { branchId: true } });
  const branchId = fullUser?.branchId ?? null;

  // Management items: Master Admin, or an eligible Manager at their own
  // branch. Never shown to other staff.
  let isEligibleManagerAnywhere = isMasterAdmin;
  if (!isMasterAdmin && branchId) {
    const managers = await listEligibleManagersForBranch(branchId).catch(() => ({ supervisors: [] as { id: string }[], usingFallback: true }));
    isEligibleManagerAnywhere = managers.supervisors.some((m) => m.id === user.id);
  }

  if (isEligibleManagerAnywhere) {
    const [openAlerts, pendingCancellations, pendingCloses, pendingServiceCloses, pendingServiceCancellations] = await Promise.all([
      prisma.pricingAlert.findMany({
        where: { status: 'OPEN', part: isMasterAdmin ? undefined : { branchId: branchId ?? undefined } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, severity: true, createdAt: true, part: { select: { id: true, name: true, branchId: true } } },
      }),
      prisma.cancellationRequest.findMany({
        where: { status: 'PENDING', jobCard: isMasterAdmin ? undefined : { branchId: branchId ?? undefined } },
        orderBy: { requestedAt: 'desc' },
        take: 10,
        select: { id: true, requestedAt: true, jobCard: { select: { id: true, jobNumber: true } } },
      }),
      prisma.closeRequest.findMany({
        where: { status: 'PENDING', jobCard: isMasterAdmin ? undefined : { branchId: branchId ?? undefined } },
        orderBy: { requestedAt: 'desc' },
        take: 10,
        select: { id: true, requestedAt: true, jobCard: { select: { id: true, jobNumber: true } } },
      }),
      // Vehicle Service close requests — same Manager decision, same feed.
      prisma.vehicleServiceCloseRequest.findMany({
        where: { status: 'PENDING', vehicleService: isMasterAdmin ? undefined : { branchId: branchId ?? undefined } },
        orderBy: { requestedAt: 'desc' },
        take: 10,
        select: { id: true, requestedAt: true, vehicleService: { select: { id: true, serviceNumber: true } } },
      }),
      prisma.vehicleServiceCancellationRequest.findMany({
        where: { status: 'PENDING', vehicleService: isMasterAdmin ? undefined : { branchId: branchId ?? undefined } },
        orderBy: { requestedAt: 'desc' },
        take: 10,
        select: { id: true, requestedAt: true, reason: true, vehicleService: { select: { id: true, serviceNumber: true } } },
      }),
    ]);

    for (const alert of openAlerts) {
      const severityLabel = alert.severity === 'CRITICAL_LOSS' ? 'Critical Loss' : alert.severity === 'DEFICIT' ? 'Margin Deficit' : 'Margin Boost';
      notifications.push({
        id: `pricing-${alert.id}`,
        kind: 'PRICING_ALERT',
        title: `${severityLabel} — ${alert.part.name}`,
        detail: 'Open Pricing Alert needs a pricing decision.',
        url: `/inventory/pricing?branchId=${alert.part.branchId}`,
        createdAt: alert.createdAt,
      });
    }
    for (const req of pendingCancellations) {
      notifications.push({
        id: `cancel-${req.id}`,
        kind: 'CANCELLATION_REQUEST',
        title: `Cancellation requested — ${req.jobCard.jobNumber}`,
        detail: 'Waiting on your approve or decline.',
        url: `/workshop/job-cards/${req.jobCard.id}#cancellation-request`,
        createdAt: req.requestedAt,
      });
    }
    for (const req of pendingCloses) {
      notifications.push({
        id: `close-${req.id}`,
        kind: 'CLOSE_REQUEST',
        title: `Close requested — ${req.jobCard.jobNumber}`,
        detail: 'Waiting on your approve or decline.',
        url: `/workshop/job-cards/${req.jobCard.id}#close-request`,
        createdAt: req.requestedAt,
      });
    }
    for (const req of pendingServiceCancellations) {
      notifications.push({
        id: `service-cancel-${req.id}`,
        kind: 'CANCELLATION_REQUEST',
        title: `Cancellation requested — ${req.vehicleService.serviceNumber}`,
        detail: req.reason,
        url: `/workshop/vehicle-service/${req.vehicleService.id}#cancellation-request`,
        createdAt: req.requestedAt,
      });
    }
    for (const req of pendingServiceCloses) {
      notifications.push({
        id: `service-close-${req.id}`,
        kind: 'CLOSE_REQUEST',
        title: `Close requested — ${req.vehicleService.serviceNumber}`,
        detail: 'Waiting on your approve or decline.',
        url: `/workshop/vehicle-service/${req.vehicleService.id}#close-request`,
        createdAt: req.requestedAt,
      });
    }
  }

  // Personal items: Job Cards waiting on this viewer's review as supervisor,
  // or on their accept/reject as assigned technician. Shown regardless of
  // management status.
  const [pendingReviews, pendingAssignments, pendingServiceReviews, pendingServiceAssignments] = await Promise.all([
    prisma.jobCard.findMany({
      where: { supervisorId: user.id, approvalStatus: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, jobNumber: true, createdAt: true },
    }),
    prisma.jobCard.findMany({
      // Not once the work is done; nothing left to accept.
      where: { assignedTechnicianId: user.id, technicianAcceptanceStatus: 'PENDING', status: { notIn: ['COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED', 'CHECKED_OUT', 'CANCELLED'] } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, jobNumber: true, createdAt: true },
    }),
    prisma.vehicleService.findMany({
      where: { supervisorId: user.id, approvalStatus: 'PENDING', escalatedToJobCardId: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, serviceNumber: true, createdAt: true },
    }),
    prisma.vehicleService.findMany({
      where: { assignedTechnicianId: user.id, technicianAcceptanceStatus: 'PENDING', escalatedToJobCardId: null, status: { notIn: ['COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED', 'COLLECTED', 'CANCELLED', 'ESCALATED'] } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, serviceNumber: true, createdAt: true },
    }),
  ]);
  for (const jc of pendingReviews) {
    notifications.push({
      id: `review-${jc.id}`,
      kind: 'JOB_CARD_APPROVAL',
      title: `Review needed — ${jc.jobNumber}`,
      detail: 'This Job Card is waiting on your own review.',
      url: `/workshop/job-cards/${jc.id}#review-approval`,
      createdAt: jc.createdAt,
    });
  }
  for (const jc of pendingAssignments) {
    notifications.push({
      id: `assign-${jc.id}`,
      kind: 'TECHNICIAN_ASSIGNMENT',
      title: `New assignment — ${jc.jobNumber}`,
      detail: 'Respond to accept or reject this Job Card.',
      url: `/workshop/job-cards/${jc.id}#technician-response`,
      createdAt: jc.createdAt,
    });
  }
  for (const sv of pendingServiceReviews) {
    notifications.push({
      id: `service-review-${sv.id}`,
      kind: 'VEHICLE_SERVICE_APPROVAL',
      title: `Review needed — ${sv.serviceNumber}`,
      detail: 'This Vehicle Service is waiting on your own review.',
      url: `/workshop/vehicle-service/${sv.id}#review-approval`,
      createdAt: sv.createdAt,
    });
  }
  for (const sv of pendingServiceAssignments) {
    notifications.push({
      id: `service-assign-${sv.id}`,
      kind: 'TECHNICIAN_ASSIGNMENT',
      title: `New assignment — ${sv.serviceNumber}`,
      detail: 'Respond to accept or reject this Vehicle Service.',
      url: `/workshop/vehicle-service/${sv.id}#technician-response`,
      createdAt: sv.createdAt,
    });
  }

  // Warranty work waiting on this viewer (verify registrations, approve
  // policy deletions at their level in the chain).
  const [warrantyA, warrantyB, securityItems, schedulingItems] = await Promise.all([warrantyP, claimsP, securityP, schedulingP]);
  const warrantyItems = [...warrantyA, ...warrantyB];
  for (const item of warrantyItems) {
    notifications.push({ id: item.id, kind: 'WARRANTY', title: item.title, detail: item.detail, url: item.url, createdAt: item.createdAt });
  }

  // Security: visitors at reception for this host; exit passes waiting at
  // this viewer's approval step.
  for (const item of securityItems) {
    notifications.push({ id: item.id, kind: 'SECURITY', title: item.title, detail: item.detail, url: item.url, createdAt: item.createdAt });
  }

  // Scheduling: today's appointments (host or participant) still to come.
  for (const n of await serviceP) notifications.push({ ...n, kind: n.id.startsWith('service-claim-') ? 'WARRANTY' : 'WORKFLOW' });
  for (const n of await projectsP) notifications.push({ ...n, kind: 'WORKFLOW' });
  for (const n of await salesP) notifications.push({ ...n, kind: 'WORKFLOW' });
  for (const n of await productionP) notifications.push({ ...n, kind: 'WORKFLOW' });
  for (const n of await warehouseP) notifications.push({ ...n, kind: 'WORKFLOW' });
  for (const n of await procurementP) notifications.push({ ...n, kind: 'WORKFLOW' });
  for (const w of await workflowP) notifications.push({ ...w, kind: 'WORKFLOW' });
  for (const w of await myWorkP) notifications.push({ ...w, kind: 'WORKFLOW' });
  // Integrity watch reviewers: new alerts (never ones about themselves).
  const integrity = await countOpenIntegrityAlerts().catch(() => ({ open: 0, high: 0 }));
  if (integrity.open) {
    notifications.push({
      id: 'integrity-new', kind: 'WORKFLOW', url: '/integrity?status=NEW', createdAt: new Date(),
      title: `${integrity.open} new integrity alert${integrity.open === 1 ? '' : 's'} to review`,
      detail: integrity.high ? `${integrity.high} high — unusual money, parts, gate or access activity` : 'Unusual money, parts, warranty, gate or access activity',
    });
  }
  for (const item of schedulingItems) {
    notifications.push({ id: item.id, kind: 'SCHEDULING', title: item.title, detail: item.detail, url: item.url, createdAt: item.createdAt });
  }

  return notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function createAnnouncement(message: string, expiresAt: Date | null): Promise<void> {
  const user = await requireUser();
  const isMasterAdmin = await currentUserIsMasterAdmin();
  const fullUser = await prisma.user.findUnique({ where: { id: user.id }, select: { organisationId: true, branchId: true } });
  if (!fullUser?.organisationId) {
    throw new Error('Your account has no organisation assigned yet.');
  }
  if (!isMasterAdmin) {
    const managers = fullUser.branchId ? await listEligibleManagersForBranch(fullUser.branchId).catch(() => ({ supervisors: [] as { id: string }[], usingFallback: true })) : { supervisors: [] as { id: string }[], usingFallback: true };
    if (!managers.supervisors.some((m) => m.id === user.id)) {
      throw new Error('Only a Manager can post an announcement.');
    }
  }
  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error('Write the announcement text.');
  }
  const announcement = await prisma.announcement.create({
    data: { organisationId: fullUser.organisationId, message: trimmed, expiresAt, createdById: user.id },
  });
  await writeAuditLog({ userId: user.id, action: 'announcement.created', entityType: 'Announcement', entityId: announcement.id, metadata: { message: trimmed } });
}

export async function deactivateAnnouncement(announcementId: string): Promise<void> {
  const user = await requireUser();
  // Same people who may post one: a Manager of their branch (or Master Admin),
  // and only within their own organisation — or whoever posted it.
  const [a, me, isMasterAdmin] = await Promise.all([
    prisma.announcement.findUnique({ where: { id: announcementId }, select: { organisationId: true, createdById: true } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { organisationId: true, branchId: true } }),
    currentUserIsMasterAdmin(),
  ]);
  if (!a || (!isMasterAdmin && a.organisationId !== me?.organisationId)) throw new Error('Announcement not found.');
  if (!isMasterAdmin && a.createdById !== user.id) {
    const managers = me?.branchId ? await listEligibleManagersForBranch(me.branchId).catch(() => ({ supervisors: [] as { id: string }[] })) : { supervisors: [] as { id: string }[] };
    if (!managers.supervisors.some((m) => m.id === user.id)) throw new Error('Only a Manager can take an announcement down.');
  }
  await prisma.announcement.update({ where: { id: announcementId }, data: { isActive: false } });
  await writeAuditLog({ userId: user.id, action: 'announcement.deactivated', entityType: 'Announcement', entityId: announcementId, metadata: {} });
}

export async function listActiveAnnouncements(organisationId: string) {
  await requireUser();
  // Only the person's own organisation — the id passed in is never trusted.
  const mine = await myOrganisationId();
  const p = await getPrincipal();
  if (!p.isSuperAdmin && mine !== organisationId) return [];
  return prisma.announcement.findMany({
    where: { organisationId, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { fullName: true } } },
  });
}

export type DashboardTrendPoint = { label: string; jobCardsOpened: number; servicesOpened: number; collected: number; refunded: number; net: number };

/** Day-by-day figures for the last 14 working days ending today (weekends
 * and Nigerian public holidays skipped). Money collected and refunded are
 * shown separately, so a refund day never shows as negative revenue. */
export async function getDashboardTrend(): Promise<DashboardTrendPoint[]> {
  await requireUser();
  const { dayKind, lagosYmd } = await import('@/lib/nigeria-calendar');
  const days: string[] = [];
  const d = new Date(`${lagosYmd(new Date())}T12:00:00+01:00`);
  while (days.length < 14) {
    const ymd = d.toISOString().slice(0, 10);
    if (dayKind(ymd).working) days.unshift(ymd);
    d.setUTCDate(d.getUTCDate() - 1);
  }
  const start = new Date(`${days[0]}T00:00:00+01:00`);
  // Same reach as the lists (a branch-scoped person sees their branch).
  // Amounts only for people allowed to see business figures; they are never
  // sent to anyone else's browser.
  const [reach, money] = await Promise.all([reachWhere('workshop.job_card.view'), allows('analytics.business.view')]);
  const viaJob = reach.branchId ? { OR: [{ jobCard: reach }, { vehicleService: reach }] } : {};
  const none = Promise.resolve([] as { recordedAt: Date; amount: unknown }[]);
  const [jobCards, services, payments, refunds] = await Promise.all([
    prisma.jobCard.findMany({ where: { ...reach, createdAt: { gte: start } }, select: { createdAt: true } }),
    prisma.vehicleService.findMany({ where: { ...reach, createdAt: { gte: start } }, select: { createdAt: true } }),
    money ? prisma.payment.findMany({ where: { ...viaJob, recordedAt: { gte: start } }, select: { recordedAt: true, amount: true } }) : none,
    money ? prisma.refund.findMany({ where: { ...viaJob, recordedAt: { gte: start } }, select: { recordedAt: true, amount: true } }) : none,
  ]);
  const onDay = (t: Date, ymd: string) => lagosYmd(t) === ymd;
  return days.map((ymd) => {
    const collected = payments.filter((p: { recordedAt: Date }) => onDay(p.recordedAt, ymd)).reduce((n: number, p: { amount: unknown }) => n + Number(p.amount), 0);
    const refunded = refunds.filter((r: { recordedAt: Date }) => onDay(r.recordedAt, ymd)).reduce((n: number, r: { amount: unknown }) => n + Number(r.amount), 0);
    return {
      label: new Date(`${ymd}T12:00:00+01:00`).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', timeZone: 'Africa/Lagos' }),
      jobCardsOpened: jobCards.filter((j: { createdAt: Date }) => onDay(j.createdAt, ymd)).length,
      servicesOpened: services.filter((v: { createdAt: Date }) => onDay(v.createdAt, ymd)).length,
      collected: Math.round(collected * 100) / 100,
      refunded: Math.round(refunded * 100) / 100,
      net: Math.round((collected - refunded) * 100) / 100,
    };
  });
}

export type NeedsAttentionSummary = {
  openPricingAlerts: number;
  pendingApprovals: number;
  pendingAssignments: number;
};

/** "Start your day" counts, derived from the same list the bell shows so
 * the two always agree. */
export async function getNeedsAttentionSummary(): Promise<NeedsAttentionSummary> {
  const notifications = await getDashboardNotifications();
  return {
    openPricingAlerts: notifications.filter((n) => n.kind === 'PRICING_ALERT').length,
    pendingApprovals: notifications.filter((n) => n.kind === 'CANCELLATION_REQUEST' || n.kind === 'CLOSE_REQUEST' || n.kind === 'JOB_CARD_APPROVAL').length,
    pendingAssignments: notifications.filter((n) => n.kind === 'TECHNICIAN_ASSIGNMENT').length,
  };
}

export type GlanceTile = { label: string; value: number; hint: string; href: string; tone: 'primary' | 'info' | 'warning' | 'error' | 'success' | 'muted' };

/** One tile per area, each linking to its list. All counts in one parallel
 * round (cheap indexed counts). */
export async function getPlatformGlance(): Promise<GlanceTile[]> {
  await requireUser();
  const dayStart = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })}T00:00:00+01:00`);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const n = (p: Promise<number>) => p.catch(() => 0);
  // Each tile counts what its list would show this person (same reach rules).
  const [work, store, gate, me] = await Promise.all([
    reachWhere('workshop.job_card.view'),
    reachWhere('store.view'),
    reachWhere('security.view'),
    requireUser().then((u) => prisma.user.findUnique({ where: { id: u.id }, select: { id: true, organisationId: true, branchId: true, departmentId: true, roles: { select: { role: { select: { slug: true } } } } } })),
  ]);
  const claimReach = typeof work.branchId === 'string' ? { OR: [{ jobCard: work }, { vehicleService: work }] } : { customer: await orgWhere() };
  const [jcActive, svActive, prsOpen, eprOpen, claimsOpen, visitors, incidents, apptsToday, broadcasts, grnsToday] = await Promise.all([
    n(prisma.jobCard.count({ where: { ...work, ...jobCardActive() } })),
    n(prisma.vehicleService.count({ where: { ...work, ...serviceInside() } })),
    n(prisma.partRequestSlip.count({ where: { ...store, status: { in: ['PENDING_HOD_APPROVAL', 'PENDING_STORE_APPROVAL', 'APPROVED'] } } })),
    n(prisma.externalProcurementRequest.count({ where: { ...store, status: { in: ['PENDING_FINANCE_REVIEW', 'PENDING_MANAGER_APPROVAL', 'APPROVED'] } } })),
    n(prisma.warrantyClaim.count({ where: { ...claimReach, status: { in: ['DRAFT', 'PENDING_HOD', 'PENDING_MANAGER', 'APPROVED_TO_SUBMIT', 'SUBMITTED'] } } })),
    n(prisma.visit.count({ where: { ...gate, status: 'CHECKED_IN' } })),
    n(prisma.securityIncident.count({ where: { ...gate, status: { in: ['OPEN', 'UNDER_REVIEW'] } } })),
    // The scheduling admin: every calendar in reach; everyone else: their own calendar.
    n(allows('schedule.manage').then(async (all) => prisma.appointment.count({ where: { ...(all ? await reachWhere('schedule.manage') : { ownerId: me?.id ?? '__none__' }), status: 'SCHEDULED', startsAt: { gte: dayStart, lt: dayEnd } } }))),
    // Only the broadcasts addressed to this person (never customers' ones),
    // matching what their bell shows.
    n(prisma.broadcast.findMany({ where: { organisationId: me?.organisationId ?? '__none__', isActive: true, startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, select: { audience: true, audienceIds: true }, take: 500 })
      .then((list: { audience: string; audienceIds: string[] }[]) => list.filter((b) => reaches(b, { branchId: me?.branchId ?? null, departmentId: me?.departmentId ?? null, roleSlugs: (me?.roles ?? []).map((r: { role: { slug: string } }) => r.role.slug) })).length)),
    n(prisma.goodsReceipt.count({ where: { ...store, receivedAt: { gte: dayStart, lt: dayEnd } } })),
  ]);
  const p = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
  // Each tile only for the people whose work it is (same rule as its page).
  const [cw, cs, cwa, csec, csch, ccost] = await Promise.all([allows('workshop.view'), allows('store.view'), allows('warranty.view'), allows('security.view'), allows('schedule.view'), Promise.all(STORE_COST_PERMISSIONS.map((k) => allows(k))).then((xs) => xs.some(Boolean))]);
  const NEED: Record<string, boolean> = { '/workshop/custody': cw, '/workshop/vehicle-service-custody': cw, '/workshop/parts-requests': cs, '/workshop/external-procurement': cs, '/inventory/goods-receipts': ccost, '/warranty/claims': cwa, '/security/on-premises': csec, '/security/incidents?tab=open': csec, '/schedule/appointments?show=today': csch, '/notifications?tab=broadcasts': true };
  const tiles: GlanceTile[] = [
    { label: 'Job Cards in progress', value: jcActive, hint: 'Open, not yet checked out', href: '/workshop/custody', tone: 'primary' },
    { label: 'Vehicle Services in custody', value: svActive, hint: 'Still in the workshop (cancelled ones awaiting hand-back included)', href: '/workshop/vehicle-service-custody', tone: 'info' },
    { label: 'Parts requests open', value: prsOpen, hint: 'Awaiting approval or release', href: '/workshop/parts-requests', tone: prsOpen ? 'warning' : 'muted' },
    { label: 'Outside purchases (EPR) open', value: eprOpen, hint: 'Awaiting review, approval or cash', href: '/workshop/external-procurement', tone: eprOpen ? 'warning' : 'muted' },
    { label: 'Goods received today', value: grnsToday, hint: p(grnsToday, 'goods receipt', 'goods receipts'), href: '/inventory/goods-receipts', tone: 'success' },
    { label: 'Warranty claims open', value: claimsOpen, hint: 'Not yet settled or closed', href: '/warranty/claims', tone: claimsOpen ? 'warning' : 'muted' },
    { label: 'Visitors on premises', value: visitors, hint: 'Checked in, not yet out', href: '/security/on-premises', tone: 'info' },
    { label: 'Open incidents', value: incidents, hint: 'Open or under review', href: '/security/incidents?tab=open', tone: incidents ? 'error' : 'muted' },
    { label: "Today's appointments", value: apptsToday, hint: 'Still scheduled', href: '/schedule/appointments?show=today', tone: 'primary' },
    { label: 'Live broadcasts', value: broadcasts, hint: 'Running now', href: '/notifications?tab=broadcasts', tone: 'success' },
  ];
  const productionTiles: GlanceTile[] = [];
  if (await allows('production.view')) {
    const pg = await getProductionGlance().catch(() => null);
    if (pg) {
      productionTiles.push({ label: 'Build orders open', value: pg.openBuildOrders, hint: 'Planned, released or in progress', href: '/production/build-orders', tone: 'primary' });
      productionTiles.push({ label: 'Units on the line', value: pg.unitsOnLine, hint: `${pg.awaitingQa} awaiting QA · ${pg.rework} in rework`, href: '/production/units?stage=line', tone: pg.rework ? 'warning' : 'info' });
    }
  }
  return [...tiles.filter((t) => NEED[t.href] ?? true), ...productionTiles, ...(await getServiceGlance()), ...(await getProjectsGlance()), ...(await getSalesGlance()), ...(await getWarehouseGlance().catch(() => [])), ...(await getProcurementGlance().catch(() => []))];
}
