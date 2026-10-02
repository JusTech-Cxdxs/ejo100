'use server';

import { prisma } from '@ejo/database';
import { getWarrantyDashboardItems } from './warranty';
import { getSecurityDashboardItems } from './security';
import { getSchedulingDashboardItems } from './scheduling';
import { getWarrantyClaimDashboardItems } from './warranty-claims';
import { requireUser, currentUserIsMasterAdmin, listEligibleManagersForBranch } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';

export type DashboardNotification = {
  id: string;
  kind: 'PRICING_ALERT' | 'CANCELLATION_REQUEST' | 'CLOSE_REQUEST' | 'JOB_CARD_APPROVAL' | 'TECHNICIAN_ASSIGNMENT' | 'VEHICLE_SERVICE_APPROVAL' | 'WARRANTY' | 'SECURITY' | 'SCHEDULING';
  title: string;
  detail: string;
  url: string;
  createdAt: Date;
};

/**
 * Every real, genuinely pending item across the system that needs
 * THIS viewer's own attention — never a generic company-wide list.
 * A Manager sees the real approvals and requests waiting on them; a
 * Technician sees their own real pending assignments. Master Admin
 * sees everything real and pending, branch-wide, matching how that
 * role already works everywhere else in this system.
 */
export async function getDashboardNotifications(): Promise<DashboardNotification[]> {
  try {
    return await getDashboardNotificationsInner();
  } catch (err) {
    // A genuinely broken notification fetch must never take the
    // entire app's layout down with it — every single page depends
    // on this same function succeeding, so a real failure here (a
    // migration not yet applied, a transient database hiccup) now
    // degrades to "no notifications shown" instead of a real "server
    // issue" error blocking navigation everywhere.
    // eslint-disable-next-line no-console
    console.error('Failed to load dashboard notifications', err);
    return [];
  }
}

async function getDashboardNotificationsInner(): Promise<DashboardNotification[]> {
  const user = await requireUser();
  // Each module's items start NOW and run alongside the Workshop checks
  // below — the total wait is the slowest module, not all of them added up
  // (every database trip crosses from the server to the database region).
  const warrantyP = getWarrantyDashboardItems().catch(() => []);
  const claimsP = getWarrantyClaimDashboardItems().catch(() => []);
  const securityP = getSecurityDashboardItems().catch(() => []);
  const schedulingP = getSchedulingDashboardItems().catch(() => []);
  const isMasterAdmin = await currentUserIsMasterAdmin();
  const notifications: DashboardNotification[] = [];

  const fullUser = await prisma.user.findUnique({ where: { id: user.id }, select: { branchId: true } });
  const branchId = fullUser?.branchId ?? null;

  // Real management-level items — Master Admin, or a real eligible
  // Manager at their own branch. Never shown to ordinary staff, the
  // same real scoping already used for these same items elsewhere.
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
        detail: 'Open Pricing Alert needs a real pricing decision.',
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

  // Real, individual items — a Job Card genuinely waiting on THIS
  // viewer's own review as its Supervisor, or genuinely waiting on
  // THIS viewer's own accept/reject as its assigned Technician. Shown
  // regardless of management status, since these are personal, not
  // management-level, responsibilities.
  const [pendingReviews, pendingAssignments, pendingServiceReviews, pendingServiceAssignments] = await Promise.all([
    prisma.jobCard.findMany({
      where: { supervisorId: user.id, approvalStatus: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, jobNumber: true, createdAt: true },
    }),
    prisma.jobCard.findMany({
      where: { assignedTechnicianId: user.id, technicianAcceptanceStatus: 'PENDING' },
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
      where: { assignedTechnicianId: user.id, technicianAcceptanceStatus: 'PENDING', escalatedToJobCardId: null },
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
    throw new Error('An announcement needs real text.');
  }
  const announcement = await prisma.announcement.create({
    data: { organisationId: fullUser.organisationId, message: trimmed, expiresAt, createdById: user.id },
  });
  await writeAuditLog({ userId: user.id, action: 'announcement.created', entityType: 'Announcement', entityId: announcement.id, metadata: { message: trimmed } });
}

export async function deactivateAnnouncement(announcementId: string): Promise<void> {
  const user = await requireUser();
  await prisma.announcement.update({ where: { id: announcementId }, data: { isActive: false } });
  await writeAuditLog({ userId: user.id, action: 'announcement.deactivated', entityType: 'Announcement', entityId: announcementId, metadata: {} });
}

export async function listActiveAnnouncements(organisationId: string) {
  await requireUser();
  return prisma.announcement.findMany({
    where: { organisationId, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { fullName: true } } },
  });
}

export type DashboardTrendPoint = { label: string; jobCardsOpened: number; servicesOpened: number; collected: number; refunded: number; net: number };

/** Real, day-by-day figures for the last 14 WORKING days ending today
 * (weekends and Nigerian public holidays skipped) — never a projection.
 * Money is shown as what was collected and what was refunded, separately,
 * so a refund day never shows as "negative revenue". */
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
  const [jobCards, services, payments, refunds] = await Promise.all([
    prisma.jobCard.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
    prisma.vehicleService.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
    prisma.payment.findMany({ where: { recordedAt: { gte: start } }, select: { recordedAt: true, amount: true } }),
    prisma.refund.findMany({ where: { recordedAt: { gte: start } }, select: { recordedAt: true, amount: true } }),
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

/** The real, honest "start your day" summary — counts derived from
 * the exact same real notification list the bell itself shows, so
 * the dashboard's own summary card and the bell can never quietly
 * disagree about what's genuinely still pending. */
export async function getNeedsAttentionSummary(): Promise<NeedsAttentionSummary> {
  const notifications = await getDashboardNotifications();
  return {
    openPricingAlerts: notifications.filter((n) => n.kind === 'PRICING_ALERT').length,
    pendingApprovals: notifications.filter((n) => n.kind === 'CANCELLATION_REQUEST' || n.kind === 'CLOSE_REQUEST' || n.kind === 'JOB_CARD_APPROVAL').length,
    pendingAssignments: notifications.filter((n) => n.kind === 'TECHNICIAN_ASSIGNMENT').length,
  };
}

export type GlanceTile = { label: string; value: number; hint: string; href: string; tone: 'primary' | 'info' | 'warning' | 'error' | 'success' | 'muted' };

/** The whole business at a glance — one tile per area, each a link to its
 * list. All counts in ONE parallel round (cheap indexed counts). */
export async function getPlatformGlance(): Promise<GlanceTile[]> {
  await requireUser();
  const dayStart = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })}T00:00:00+01:00`);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const n = (p: Promise<number>) => p.catch(() => 0);
  const [jcActive, svActive, prsOpen, eprOpen, claimsOpen, visitors, incidents, apptsToday, broadcasts, grnsToday] = await Promise.all([
    n(prisma.jobCard.count({ where: { status: { notIn: ['CHECKED_OUT', 'CANCELLED'] } } })),
    n(prisma.vehicleService.count({ where: { status: { in: ['CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED'] } } })),
    n(prisma.partRequestSlip.count({ where: { status: { in: ['PENDING_HOD_APPROVAL', 'PENDING_STORE_APPROVAL', 'APPROVED'] } } })),
    n(prisma.externalProcurementRequest.count({ where: { status: { in: ['PENDING_FINANCE_REVIEW', 'PENDING_MANAGER_APPROVAL', 'APPROVED'] } } })),
    n(prisma.warrantyClaim.count({ where: { status: { in: ['DRAFT', 'PENDING_HOD', 'PENDING_MANAGER', 'APPROVED_TO_SUBMIT', 'SUBMITTED'] } } })),
    n(prisma.visit.count({ where: { status: 'CHECKED_IN' } })),
    n(prisma.securityIncident.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } })),
    n(prisma.appointment.count({ where: { status: 'SCHEDULED', startsAt: { gte: dayStart, lt: dayEnd } } })),
    n(prisma.broadcast.count({ where: { isActive: true, startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] } })),
    n(prisma.goodsReceipt.count({ where: { receivedAt: { gte: dayStart, lt: dayEnd } } })),
  ]);
  const p = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
  return [
    { label: 'Job Cards in progress', value: jcActive, hint: 'Open, not yet checked out', href: '/workshop/custody', tone: 'primary' },
    { label: 'Vehicle Services in progress', value: svActive, hint: 'In the workshop now', href: '/workshop/vehicle-service', tone: 'info' },
    { label: 'Parts requests open', value: prsOpen, hint: 'Awaiting approval or release', href: '/workshop/parts-requests', tone: prsOpen ? 'warning' : 'muted' },
    { label: 'Outside purchases (EPR) open', value: eprOpen, hint: 'Awaiting review, approval or cash', href: '/workshop/external-procurement', tone: eprOpen ? 'warning' : 'muted' },
    { label: 'Goods received today', value: grnsToday, hint: p(grnsToday, 'goods receipt', 'goods receipts'), href: '/inventory/goods-receipts', tone: 'success' },
    { label: 'Warranty claims open', value: claimsOpen, hint: 'Not yet settled or closed', href: '/warranty/claims', tone: claimsOpen ? 'warning' : 'muted' },
    { label: 'Visitors on premises', value: visitors, hint: 'Checked in, not yet out', href: '/security/on-premises', tone: 'info' },
    { label: 'Open incidents', value: incidents, hint: 'Open or under review', href: '/security/incidents?tab=open', tone: incidents ? 'error' : 'muted' },
    { label: "Today's appointments", value: apptsToday, hint: 'Still scheduled', href: '/schedule/appointments?show=today', tone: 'primary' },
    { label: 'Live broadcasts', value: broadcasts, hint: 'Running now', href: '/notifications?tab=broadcasts', tone: 'success' },
  ];
}
