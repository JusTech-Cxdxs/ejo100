'use server';

import { prisma } from '@ejo/database';
import { requireUser, currentUserIsMasterAdmin, writeAuditLog, listEligibleManagersForBranch } from './workshop';

export type DashboardNotification = {
  id: string;
  kind: 'PRICING_ALERT' | 'CANCELLATION_REQUEST' | 'CLOSE_REQUEST' | 'JOB_CARD_APPROVAL' | 'TECHNICIAN_ASSIGNMENT';
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
  const user = await requireUser();
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
    const [openAlerts, pendingCancellations, pendingCloses] = await Promise.all([
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
        url: `/workshop/job-cards/${req.jobCard.id}`,
        createdAt: req.requestedAt,
      });
    }
    for (const req of pendingCloses) {
      notifications.push({
        id: `close-${req.id}`,
        kind: 'CLOSE_REQUEST',
        title: `Close requested — ${req.jobCard.jobNumber}`,
        detail: 'Waiting on your approve or decline.',
        url: `/workshop/job-cards/${req.jobCard.id}`,
        createdAt: req.requestedAt,
      });
    }
  }

  // Real, individual items — a Job Card genuinely waiting on THIS
  // viewer's own review as its Supervisor, or genuinely waiting on
  // THIS viewer's own accept/reject as its assigned Technician. Shown
  // regardless of management status, since these are personal, not
  // management-level, responsibilities.
  const [pendingReviews, pendingAssignments] = await Promise.all([
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
  ]);
  for (const jc of pendingReviews) {
    notifications.push({
      id: `review-${jc.id}`,
      kind: 'JOB_CARD_APPROVAL',
      title: `Review needed — ${jc.jobNumber}`,
      detail: 'This Job Card is waiting on your own review.',
      url: `/workshop/job-cards/${jc.id}`,
      createdAt: jc.createdAt,
    });
  }
  for (const jc of pendingAssignments) {
    notifications.push({
      id: `assign-${jc.id}`,
      kind: 'TECHNICIAN_ASSIGNMENT',
      title: `New assignment — ${jc.jobNumber}`,
      detail: 'Respond to accept or reject this Job Card.',
      url: `/workshop/job-cards/${jc.id}`,
      createdAt: jc.createdAt,
    });
  }

  return notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export type MarqueeItem = { id: string; text: string; kind: 'ANNOUNCEMENT' | 'ACTIVITY' };

/** Real, live announcements plus real recent activity, mixed into one
 * real feed — never fabricated filler when either list is thin. */
export async function getMarqueeItems(organisationId: string): Promise<MarqueeItem[]> {
  await requireUser();
  const [announcements, recentActivity] = await Promise.all([
    prisma.announcement.findMany({
      where: { organisationId, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, message: true },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, action: true, entityType: true, metadata: true },
    }),
  ]);

  const items: MarqueeItem[] = announcements.map((a: { id: string; message: string }) => ({ id: `ann-${a.id}`, text: a.message, kind: 'ANNOUNCEMENT' as const }));
  for (const entry of recentActivity) {
    const text = describeActivity(entry.action, entry.entityType, entry.metadata);
    if (text) items.push({ id: `act-${entry.id}`, text, kind: 'ACTIVITY' as const });
  }
  return items;
}

/** Turns a raw audit action into one short, real, human sentence for
 * the marquee — deliberately conservative: an action this function
 * doesn't recognize is silently skipped rather than shown as a raw
 * code, matching this project's own standing rule that a real action
 * label is always required, never a fallback to the database string
 * itself. */
function describeActivity(action: string, entityType: string, metadata: unknown): string | null {
  const meta = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>;
  switch (action) {
    case 'job_card.status_updated': {
      const to = typeof meta.to === 'string' ? meta.to : null;
      return to === 'CHECKED_OUT' ? 'A vehicle was just checked out.' : to === 'COMPLETED' ? 'A Job Card was just marked Completed.' : null;
    }
    case 'goods_receipt.recorded':
      return 'A new Goods Receipt was just recorded.';
    case 'pricing_alert.dismissed':
      return null;
    case 'part.selling_price_set':
      return typeof meta.name === 'string' ? `Selling price updated for ${meta.name}.` : null;
    default:
      return entityType === 'JobCard' && action === 'job_card.created' ? 'A new Job Card was just opened.' : null;
  }
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
      throw new Error('Only a Manager or Master Admin can post an announcement.');
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

export type DashboardTrendPoint = { label: string; jobCardsOpened: number; revenue: number };

/** Real, day-by-day figures for the last 14 real days — never a
 * projection or an estimate, purely counting/summing what actually
 * happened. A day with genuinely nothing shows a real 0, not an
 * omitted point, so the chart's own x-axis stays a real, unbroken
 * calendar. */
export async function getDashboardTrend(): Promise<DashboardTrendPoint[]> {
  await requireUser();
  const days = 14;
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const [jobCards, payments]: [{ createdAt: Date }[], { recordedAt: Date; amount: unknown }[]] = await Promise.all([
    prisma.jobCard.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
    prisma.payment.findMany({ where: { recordedAt: { gte: start } }, select: { recordedAt: true, amount: true } }),
  ]);

  const points: DashboardTrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    const dayEnd = new Date(day);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const label = day.toLocaleDateString('en-NG', { month: 'short', day: 'numeric', timeZone: 'Africa/Lagos' });
    const jobCardsOpened = jobCards.filter((jc) => jc.createdAt >= day && jc.createdAt < dayEnd).length;
    const revenue = payments
      .filter((p) => p.recordedAt >= day && p.recordedAt < dayEnd)
      .reduce((sum, p) => sum + Number(p.amount), 0);
    points.push({ label, jobCardsOpened, revenue: Math.round(revenue * 100) / 100 });
  }
  return points;
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
