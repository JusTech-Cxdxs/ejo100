'use server';

import { cache } from 'react';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { authorize, allows, getPrincipal } from '@/lib/authz/server';
import { scopeFor } from '@/lib/authz/catalogue';
import { getDashboardNotifications, type DashboardNotification } from './dashboard';
import { securityActionLabel, securityActionDetail } from '@/lib/security-labels';
import {
  entityTypesForRoles, recordUrl, areaOf, HIDDEN_ACTIONS, describeApiEntry, BROADCAST_CATEGORIES, DURATIONS,
  broadcastEnd, durationLabel, broadcastState, reaches, type BroadcastState,
} from '@/lib/notification-rules';
import { deliverDueBroadcastEmails } from '@/lib/broadcast-delivery';
import { resolveRecords } from '@/lib/record-resolver';
import { livePulse } from '@/lib/live-pulse';

class NotificationError extends Error {}

type Me = { id: string; fullName: string; organisationId: string | null; branchId: string | null; departmentId: string | null; roleSlugs: string[]; isMaster: boolean };

const me = cache(meUncached);
async function meUncached(): Promise<Me> {
  const user = await requireUser();
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, fullName: true, organisationId: true, branchId: true, departmentId: true, roles: { select: { role: { select: { slug: true, isSuperAdmin: true } } } } } });
  if (!u) throw new NotificationError('Not signed in.');
  const slugs = u.roles.map((r: { role: { slug: string } }) => r.role.slug);
  return { id: u.id, fullName: u.fullName, organisationId: u.organisationId, branchId: u.branchId, departmentId: u.departmentId, roleSlugs: slugs, isMaster: u.roles.some((r: { role: { isSuperAdmin: boolean } }) => r.role.isSuperAdmin) };
}

// ── Activity (from the audit trail) ───────────────────────────────────

export type ActivityItem = { key: string; id: string; title: string; detail: string | null; area: string; url: string; actor: string | null; at: Date; read: boolean };

const FEED_DAYS = 90;

/** Everything this person should see: their area (heads), everything
 * (administrators), plus any record they have acted on themselves. */
export async function getActivityFeed(opts: { unreadOnly?: boolean; take?: number; q?: string } = {}): Promise<ActivityItem[]> {
  const m = await me();
  const scope = m.isMaster ? 'ALL' : entityTypesForRoles(m.roleSlugs);
  const since = new Date(Date.now() - FEED_DAYS * 86400000);
  // Records I have acted on (my "chains").
  // Business events only — the low-level data journal ("db:…") is the
  // complete record for the audit dashboard, never shown as activity.
  // …and records I am PART OF even before acting: the technician assigned,
  // the supervisor, the person who opened the Job Card / service, and the
  // person who raised a parts request or outside purchase.
  const recent = new Date(Date.now() - 90 * 86400000);
  const [mine, jcs, svs, prss, eprs] = await Promise.all([
    prisma.auditLog.findMany({ where: { userId: m.id, createdAt: { gte: recent }, NOT: { entityType: { startsWith: 'db:' } } }, distinct: ['entityType', 'entityId'], select: { entityType: true, entityId: true }, take: 2000 }),
    prisma.jobCard.findMany({ where: { updatedAt: { gte: recent }, OR: [{ assignedTechnicianId: m.id }, { supervisorId: m.id }, { createdById: m.id }] }, select: { id: true }, take: 500 }),
    prisma.vehicleService.findMany({ where: { createdAt: { gte: new Date(Date.now() - 180 * 86400000) }, OR: [{ assignedTechnicianId: m.id }, { supervisorId: m.id }, { createdById: m.id }] }, select: { id: true }, take: 500 }),
    prisma.partRequestSlip.findMany({ where: { updatedAt: { gte: recent }, requestedById: m.id }, select: { id: true }, take: 500 }),
    prisma.externalProcurementRequest.findMany({ where: { updatedAt: { gte: recent }, requestedById: m.id }, select: { id: true }, take: 500 }),
  ]);
  const byType = new Map<string, string[]>();
  for (const r of mine) if (r.entityId) byType.set(r.entityType, [...(byType.get(r.entityType) ?? []), r.entityId]);
  const add = (t: string, ids: { id: string }[]) => { if (ids.length) byType.set(t, [...new Set([...(byType.get(t) ?? []), ...ids.map((x) => x.id)])]); };
  add('JobCard', jcs); add('VehicleService', svs); add('PartRequestSlip', prss); add('ExternalProcurementRequest', eprs);
  // Finance hears about every payment, refund, customer notification and
  // outside purchase — so they know when money is expected or moves.
  const financeWatch = m.roleSlugs.includes('finance-officer') ? [{ action: { contains: 'payment' } }, { action: { contains: 'refund' } }, { action: { contains: 'customer_notified' } }, { entityType: 'ExternalProcurementRequest' }] : [];
  const involved = [...byType.entries()].map(([entityType, ids]) => ({ entityType, entityId: { in: ids } }));
  const where = {
    // Only this organisation's events (the platform team sees every organisation).
    ...(m.isMaster ? {} : { organisationId: m.organisationId ?? '__no_organisation__' }),
    createdAt: { gte: since },
    action: { notIn: HIDDEN_ACTIONS },
    // Not the low-level data journal, and not failed API attempts.
    NOT: [{ entityType: { startsWith: 'db:' } }, { action: { endsWith: '.failed' } }],
    OR: [{ userId: null }, { userId: { not: m.id } }],
    ...(scope === 'ALL' ? {} : { AND: [{ OR: [...(scope.length ? [{ entityType: { in: scope } }] : []), ...involved, ...financeWatch] }] }),
  };
  if (scope !== 'ALL' && scope.length === 0 && involved.length === 0 && financeWatch.length === 0) return [];
  const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(opts.take ?? 150, 1000), select: { id: true, action: true, entityType: true, entityId: true, metadata: true, createdAt: true, userId: true } });
  const keys = rows.map((r: { id: string }) => `audit:${r.id}`);
  const [reads, actors] = await Promise.all([
    prisma.notificationRead.findMany({ where: { userId: m.id, key: { in: keys } }, select: { key: true } }),
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r: { userId: string | null }) => r.userId).filter((v: string | null): v is string => Boolean(v)))] } }, select: { id: true, fullName: true, roles: { select: { role: { select: { isSuperAdmin: true } } } } } }),
  ]);
  const read = new Set(reads.map((r: { key: string }) => r.key));
  // Exact pages (an estimate line → its Job Card, a payment → its service…).
  const resolved = await resolveRecords(rows.filter((r: { entityId: string | null; entityType: string }) => r.entityId && !r.entityType.startsWith('api:')).map((r: { entityType: string; entityId: string | null }) => ({ type: r.entityType, id: r.entityId! })));
  // The platform team is shown to organisations as "Platform support".
  const name = new Map(actors.map((a: { id: string; fullName: string; roles: { role: { isSuperAdmin: boolean } }[] }) => [a.id, !m.isMaster && a.roles.some((r) => r.role.isSuperAdmin) ? 'Platform support' : a.fullName]));
  // Reach: a branch-scoped person is never told about another branch's records
  // (the same rule as the pages the links open).
  const principal = await getPrincipal();
  const myBranch = !principal.isSuperAdmin && scopeFor(principal, 'workshop.job_card.view') !== 'ALL' ? principal.branchId : null;
  const items = rows.flatMap((r: (typeof rows)[number]) => {
    if (myBranch && r.entityId) {
      const b = resolved.get(`${r.entityType}:${r.entityId}`)?.branchId;
      if (b && b !== myBranch) return [];
    }
    // API request records (users, roles, branches…) read as plain events.
    if (r.entityType.startsWith('api:')) {
      const d = describeApiEntry(r.action, r.entityType);
      if (!d) return [];
      return [{ key: `audit:${r.id}`, id: r.id, title: d.title, detail: null, area: 'SYSTEM', url: d.url, actor: r.userId ? name.get(r.userId) ?? null : 'System', at: r.createdAt, read: read.has(`audit:${r.id}`) }];
    }
    const meta = r.metadata && typeof r.metadata === 'object' ? (r.metadata as Record<string, unknown>) : null;
    const number = meta && typeof meta === 'object' ? (['jobNumber', 'serviceNumber', 'visitNumber', 'passNumber', 'permitNumber', 'exitNumber', 'incidentNumber', 'deliveryNumber', 'appointmentNumber', 'warrantyNumber', 'claimNumber', 'slipNumber', 'referenceNumber', 'broadcastNumber'].map((k) => meta[k]).find((v) => typeof v === 'string') as string | undefined) : undefined;
    return [{
      key: `audit:${r.id}`,
      id: r.id,
      title: `${securityActionLabel(r.action)}${number ? ` — ${number}` : ''}`,
      detail: securityActionDetail(r.action, meta),
      area: areaOf(r.entityType),
      url: r.entityId ? resolved.get(`${r.entityType}:${r.entityId}`)?.url ?? recordUrl(r.entityType, r.entityId) : '/audit-logs',
      actor: r.userId ? name.get(r.userId) ?? null : 'System',
      at: r.createdAt,
      read: read.has(`audit:${r.id}`),
    }];
  });
  const term = opts.q?.trim().toLowerCase();
  const found = term ? items.filter((i: ActivityItem) => [i.title, i.detail, i.actor, i.area].some((x) => (x ?? '').toLowerCase().includes(term))) : items;
  return opts.unreadOnly ? found.filter((i: ActivityItem) => !i.read) : found;
}

// ── Broadcasts for me ─────────────────────────────────────────────────

export type MyBroadcast = { key: string; id: string; number: string; category: string; title: string; message: string; startsAt: Date; endsAt: Date | null; read: boolean };

export async function getMyBroadcasts(): Promise<MyBroadcast[]> {
  const m = await me();
  if (!m.organisationId) return [];
  const now = new Date();
  const live = await prisma.broadcast.findMany({
    where: { organisationId: m.organisationId, isActive: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    orderBy: { startsAt: 'desc' },
    select: { id: true, broadcastNumber: true, category: true, title: true, message: true, audience: true, audienceIds: true, startsAt: true, endsAt: true },
  });
  const mineOnly = live.filter((b: (typeof live)[number]) => reaches(b, m));
  const reads = await prisma.notificationRead.findMany({ where: { userId: m.id, key: { in: mineOnly.map((b: { id: string }) => `bc:${b.id}`) } }, select: { key: true } });
  const read = new Set(reads.map((r: { key: string }) => r.key));
  return mineOnly.map((b: (typeof mineOnly)[number]) => ({ key: `bc:${b.id}`, id: b.id, number: b.broadcastNumber, category: b.category, title: b.title, message: b.message, startsAt: b.startsAt, endsAt: b.endsAt, read: read.has(`bc:${b.id}`) }));
}

// ── The live summary (bell, marquee) ──────────────────────────────────

export type NotificationSummary = {
  actions: DashboardNotification[];
  unreadActivity: ActivityItem[];
  unreadBroadcasts: MyBroadcast[];
  total: number;
  /** Changes whenever something new arrives — the bell plays a sound. */
  signature: string;
  muted: boolean;
};

// Per-user summary cache (per server instance): if nothing has changed since
// this person's last summary (same change signal) and it is under a minute old,
// return it instantly instead of recomputing ~25 queries. Own read / unread /
// mute actions clear it; the minute limit covers time-based items (overdue…).
const SUMMARY_TTL_MS = 60_000;
const summaryCache = new Map<string, { pulse: string; at: number; value: NotificationSummary }>();
function forgetSummary(userId: string) { summaryCache.delete(userId); }

export async function getNotificationSummary(): Promise<NotificationSummary> {
  try {
    const m = await me();
    const pulse = await livePulse(m.organisationId).catch(() => '');
    const hit = summaryCache.get(m.id);
    if (hit && pulse && hit.pulse === pulse && Date.now() - hit.at < SUMMARY_TTL_MS) return hit.value;
    const value = await computeSummary(m);
    if (pulse) {
      if (summaryCache.size > 2000) summaryCache.clear();
      summaryCache.set(m.id, { pulse, at: Date.now(), value });
    }
    return value;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Notification summary failed', err);
    return { actions: [], unreadActivity: [], unreadBroadcasts: [], total: 0, signature: '', muted: false };
  }
}

async function computeSummary(m: Me): Promise<NotificationSummary> {
  {
    const [actions, activity, broadcasts, pref] = await Promise.all([
      getDashboardNotifications(),
      getActivityFeed({ unreadOnly: true, take: 100 }),
      getMyBroadcasts(),
      prisma.notificationPreference.findUnique({ where: { userId: m.id }, select: { muted: true } }),
    ]);
    const unreadBroadcasts = broadcasts.filter((b) => !b.read);
    const signature = [actions.map((a) => a.id).join(','), activity[0]?.key ?? '', unreadBroadcasts[0]?.key ?? ''].join('|');
    return { actions, unreadActivity: activity, unreadBroadcasts, total: actions.length + activity.length + unreadBroadcasts.length, signature, muted: pref?.muted ?? false };
  }
}

export async function markNotificationsRead(keys: string[]): Promise<void> {
  const m = await me();
  forgetSummary(m.id);
  const clean = [...new Set(keys.filter((k) => /^(audit|bc):[A-Za-z0-9_-]+$/.test(k)))].slice(0, 500);
  if (clean.length) await prisma.notificationRead.createMany({ data: clean.map((key) => ({ userId: m.id, key })), skipDuplicates: true });
}

/** Undo "read" — removes only THIS person's own read markers. */
export async function markNotificationsUnread(keys: string[]): Promise<void> {
  const m = await me();
  forgetSummary(m.id);
  const clean = [...new Set(keys.filter((k) => /^(audit|bc):[A-Za-z0-9_-]+$/.test(k)))].slice(0, 500);
  if (clean.length) await prisma.notificationRead.deleteMany({ where: { userId: m.id, key: { in: clean } } });
}

export async function markAllRead(kind: 'activity' | 'broadcasts' | 'all'): Promise<void> {
  const keys = [
    ...(kind !== 'broadcasts' ? (await getActivityFeed({ unreadOnly: true, take: 300 })).map((a) => a.key) : []),
    ...(kind !== 'activity' ? (await getMyBroadcasts()).filter((b) => !b.read).map((b) => b.key) : []),
  ];
  await markNotificationsRead(keys);
}

export async function setNotificationsMuted(muted: boolean): Promise<void> {
  const m = await me();
  forgetSummary(m.id);
  await prisma.notificationPreference.upsert({ where: { userId: m.id }, create: { userId: m.id, muted }, update: { muted } });
}

// ── Broadcast management ──────────────────────────────────────────────

/** Broadcasting is a catalogue permission (Broadcaster / Administrator by
 * default, plus any grant added on the Roles page). */
async function requireBroadcaster(): Promise<Me> {
  const m = await me();
  await authorize('notifications.broadcast.send', undefined, 'broadcast.manage', 'Only a Broadcaster or an administrator can manage broadcasts.');
  if (!m.organisationId) throw new NotificationError('No organisation.');
  return m;
}

/** A broadcast is only ever managed inside the organisation that sent it —
 * another organisation's broadcast behaves as "not found". */
async function ownBroadcast<T extends object>(m: Me, id: string, select: T) {
  const b = await prisma.broadcast.findFirst({ where: { id, organisationId: m.organisationId ?? '__none__' }, select: select as never });
  if (!b) throw new NotificationError('Broadcast not found.');
  return b as Record<string, unknown>;
}

export async function canBroadcast(): Promise<boolean> {
  try {
    const m = await me();
    return !!m.organisationId && (await allows('notifications.broadcast.send'));
  } catch {
    return false;
  }
}

async function nextBroadcastNumber(): Promise<string> {
  const start = `BC-${new Date().getFullYear()}-`;
  const last = await prisma.broadcast.findFirst({ where: { broadcastNumber: { startsWith: start } }, orderBy: { broadcastNumber: 'desc' }, select: { broadcastNumber: true } });
  return `${start}${String(last ? parseInt(last.broadcastNumber.slice(start.length), 10) + 1 : 1).padStart(6, '0')}`;
}

export type BroadcastInput = { category: string; title: string; message: string; audience: string; audienceIds: string[]; startsAt: Date; duration: string; sendEmail: boolean };

export async function createBroadcast(input: BroadcastInput): Promise<{ id: string; broadcastNumber: string }> {
  const m = await requireBroadcaster();
  if (!BROADCAST_CATEGORIES.includes(input.category)) throw new NotificationError('Choose the kind of broadcast.');
  if (!input.title.trim()) throw new NotificationError('Give the broadcast a title.');
  if (!input.message.trim()) throw new NotificationError('Write the message.');
  if (!['ALL', 'BRANCH', 'DEPARTMENT', 'ROLE'].includes(input.audience)) throw new NotificationError('Choose who it is for.');
  const ids = [...new Set(input.audienceIds.filter(Boolean))];
  if (input.audience !== 'ALL' && ids.length === 0) throw new NotificationError(`Choose at least one ${input.audience === 'BRANCH' ? 'branch' : input.audience === 'DEPARTMENT' ? 'department' : 'role'}.`);
  if (!DURATIONS.some((d) => d.value === input.duration)) throw new NotificationError('Choose how long it runs.');
  const start = Number.isNaN(new Date(input.startsAt).getTime()) ? new Date() : new Date(input.startsAt);
  if (start.getTime() < Date.now() - 5 * 60000) throw new NotificationError('The start time has already passed — choose "now" or a later time.');
  const endsAt = broadcastEnd(start, input.duration);
  const broadcastNumber = await nextBroadcastNumber();
  const b = await prisma.broadcast.create({ data: { broadcastNumber, organisationId: m.organisationId!, category: input.category as never, title: input.title.trim(), message: input.message.trim(), audience: input.audience as never, audienceIds: input.audience === 'ALL' ? [] : ids, startsAt: start, endsAt, durationLabel: durationLabel(input.duration), sendEmail: input.sendEmail, createdById: m.id } });
  await writeAuditLog({ userId: m.id, action: 'broadcast.created', entityType: 'Broadcast', entityId: b.id, metadata: { broadcastNumber, category: input.category, title: input.title.trim(), audience: input.audience, duration: durationLabel(input.duration), email: input.sendEmail } });
  if (input.sendEmail) await deliverDueBroadcastEmails();
  return { id: b.id, broadcastNumber };
}

export async function stopBroadcast(id: string): Promise<void> {
  const m = await requireBroadcaster();
  const b = (await ownBroadcast(m, id, { broadcastNumber: true, isActive: true })) as { broadcastNumber: string; isActive: boolean };
  if (!b.isActive) throw new NotificationError('It is already off.');
  await prisma.broadcast.update({ where: { id }, data: { isActive: false, stoppedAt: new Date(), stoppedById: m.id } });
  await writeAuditLog({ userId: m.id, action: 'broadcast.stopped', entityType: 'Broadcast', entityId: id, metadata: { broadcastNumber: b.broadcastNumber } });
}

/** Run an ended / stopped broadcast again, from now, for a new duration. */
export async function reactivateBroadcast(id: string, duration: string, resendEmail: boolean): Promise<void> {
  const m = await requireBroadcaster();
  if (!DURATIONS.some((d) => d.value === duration)) throw new NotificationError('Choose how long it runs.');
  const b = (await ownBroadcast(m, id, { broadcastNumber: true, isActive: true, startsAt: true, endsAt: true, stoppedAt: true })) as { broadcastNumber: string; isActive: boolean; startsAt: Date; endsAt: Date | null; stoppedAt: Date | null };
  if (broadcastState(b) === 'LIVE' || broadcastState(b) === 'SCHEDULED') throw new NotificationError('It is still running.');
  const now = new Date();
  await prisma.broadcast.update({ where: { id }, data: { isActive: true, startsAt: now, endsAt: broadcastEnd(now, duration), durationLabel: durationLabel(duration), stoppedAt: null, stoppedById: null, ...(resendEmail ? { sendEmail: true, emailedAt: null } : {}) } });
  // Everyone sees it again as new.
  await prisma.notificationRead.deleteMany({ where: { key: `bc:${id}` } });
  await writeAuditLog({ userId: m.id, action: 'broadcast.reactivated', entityType: 'Broadcast', entityId: id, metadata: { broadcastNumber: b.broadcastNumber, duration: durationLabel(duration), email: resendEmail } });
  if (resendEmail) await deliverDueBroadcastEmails();
}

export async function deleteBroadcast(id: string): Promise<void> {
  const m = await requireBroadcaster();
  const b = (await ownBroadcast(m, id, { broadcastNumber: true, title: true })) as { broadcastNumber: string; title: string };
  await writeAuditLog({ userId: m.id, action: 'broadcast.deleted', entityType: 'Broadcast', entityId: id, metadata: { broadcastNumber: b.broadcastNumber, title: b.title } });
  await prisma.notificationRead.deleteMany({ where: { key: `bc:${id}` } });
  await prisma.broadcast.delete({ where: { id } });
}

const BC_TABS = ['live', 'scheduled', 'ended', 'all'] as const;
export async function listBroadcasts(q?: string, tab?: string, category?: string) {
  const m = await me();
  const t = q?.trim();
  const rows = await prisma.broadcast.findMany({
    where: { organisationId: m.organisationId ?? '', ...(category && BROADCAST_CATEGORIES.includes(category) ? { category: category as never } : {}), ...(t ? { OR: [{ broadcastNumber: { contains: t, mode: 'insensitive' } }, { title: { contains: t, mode: 'insensitive' } }, { message: { contains: t, mode: 'insensitive' } }] } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: { createdBy: { select: { fullName: true } } },
  });
  const now = new Date();
  const withState = rows.map((b: (typeof rows)[number]) => ({ ...b, state: broadcastState(b, now) as BroadcastState }));
  const is: Record<(typeof BC_TABS)[number], (b: (typeof withState)[number]) => boolean> = { live: (b) => b.state === 'LIVE', scheduled: (b) => b.state === 'SCHEDULED', ended: (b) => b.state === 'ENDED' || b.state === 'STOPPED', all: () => true };
  const current = ((BC_TABS as readonly string[]).includes(tab ?? '') ? tab : 'live') as (typeof BC_TABS)[number];
  return { tab: current, counts: Object.fromEntries(BC_TABS.map((k) => [k, withState.filter(is[k]).length])) as Record<(typeof BC_TABS)[number], number>, rows: withState.filter(is[current]) };
}

export async function getBroadcast(id: string) {
  const m = await me();
  const b = await prisma.broadcast.findUnique({ where: { id }, include: { createdBy: { select: { fullName: true } }, stoppedBy: { select: { fullName: true } } } });
  if (!b || b.organisationId !== m.organisationId) return null;
  const readCount = await prisma.notificationRead.count({ where: { key: `bc:${id}` } });
  return { ...b, state: broadcastState(b), readCount };
}

/** Choices for the audience picker. */
export async function listAudienceOptions() {
  const m = await me();
  const [branches, departments, roles] = await Promise.all([
    prisma.branch.findMany({ where: m.isMaster ? {} : { businessUnit: { organisationId: m.organisationId ?? '__none__' } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: m.isMaster ? {} : { branch: { businessUnit: { organisationId: m.organisationId ?? '__none__' } } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.role.findMany({ where: { organisationId: m.organisationId ?? '' }, orderBy: { name: 'asc' }, select: { slug: true, name: true } }),
  ]);
  return { branches, departments, roles: roles.filter((r: { slug: string }, i: number, a: { slug: string }[]) => a.findIndex((x) => x.slug === r.slug) === i) };
}

/**
 * The cheap "has anything changed?" check the browser makes every few
 * seconds: the newest audit entry and the newest broadcast change — two
 * indexed single-row reads. Only when this changes does the browser fetch
 * the full summary and refresh the page's data.
 */
/** The cheap change signal for this person's organisation (see lib/live-pulse).
 * The live check itself uses GET /api/live/pulse; this stays for callers that
 * already hold a session in a server action. */
export async function getNotificationPulse(): Promise<string> {
  try {
    const m = await me();
    return await livePulse(m.organisationId);
  } catch {
    return '';
  }
}

// ── Broadcast analytics ───────────────────────────────────────────────

/** Everything the broadcast dashboard shows (last 12 months). */
export async function getBroadcastAnalytics() {
  const m = await me();
  const since = new Date(Date.now() - 365 * 86400000);
  const [rows, users, emails] = await Promise.all([
    prisma.broadcast.findMany({ where: { organisationId: m.organisationId ?? '', createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, select: { id: true, broadcastNumber: true, category: true, title: true, audience: true, audienceIds: true, startsAt: true, endsAt: true, isActive: true, stoppedAt: true, sendEmail: true, createdAt: true } }),
    prisma.user.findMany({ where: { organisationId: m.organisationId ?? '', isActive: true }, select: { branchId: true, departmentId: true, roles: { select: { role: { select: { slug: true } } } } } }),
    // Delivery records of THIS organisation's broadcasts only (by broadcast id —
    // scheduled deliveries may carry no organisation of their own).
    prisma.broadcast.findMany({ where: { organisationId: m.organisationId ?? '', createdAt: { gte: since } }, select: { id: true } })
      .then((own: { id: string }[]) => prisma.auditLog.findMany({ where: { action: 'broadcast.emailed', createdAt: { gte: since }, entityId: { in: own.map((b) => b.id) } }, select: { entityId: true, metadata: true } })),
  ]);
  const people = users.map((u: (typeof users)[number]) => ({ branchId: u.branchId, departmentId: u.departmentId, roleSlugs: u.roles.map((r: { role: { slug: string } }) => r.role.slug) }));
  const readRows = rows.length ? await prisma.notificationRead.groupBy({ by: ['key'], where: { key: { in: rows.map((r: { id: string }) => `bc:${r.id}`) } }, _count: { key: true } }) : [];
  const reads = new Map(readRows.map((r: { key: string; _count: { key: number } }) => [r.key, r._count.key]));
  const emailed = new Map<string, { sent: number; failed: number }>();
  for (const e of emails) {
    const meta = (e.metadata ?? {}) as { sent?: number; failed?: number };
    if (e.entityId) emailed.set(e.entityId, { sent: meta.sent ?? 0, failed: meta.failed ?? 0 });
  }
  const now = new Date();
  const list = rows.map((b: (typeof rows)[number]) => {
    const reach = people.filter((p: (typeof people)[number]) => reaches(b, p)).length;
    const read = Math.min(reach, Number(reads.get(`bc:${b.id}`) ?? 0));
    const state = broadcastState(b, now);
    const started = +new Date(b.startsAt) <= +now;
    return { ...b, state, reach, read, readRate: reach && started ? Math.round((read / reach) * 1000) / 10 : null, email: emailed.get(b.id) ?? null };
  });
  const started = list.filter((b: (typeof list)[number]) => +new Date(b.startsAt) <= +now);
  const sumBy = (xs: typeof list, f: (b: (typeof list)[number]) => number) => xs.reduce((s: number, b: (typeof list)[number]) => s + f(b), 0);
  const reach = sumBy(started, (b) => b.reach);
  const read = sumBy(started, (b) => b.read);
  const sent = sumBy(list, (b) => b.email?.sent ?? 0);
  const failed = sumBy(list, (b) => b.email?.failed ?? 0);
  const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
  const byCategory = BROADCAST_CATEGORIES.map((c) => {
    const xs = started.filter((b: (typeof list)[number]) => b.category === c);
    const r = sumBy(xs, (b) => b.reach), rd = sumBy(xs, (b) => b.read);
    return { category: c, count: list.filter((b: (typeof list)[number]) => b.category === c).length, reach: r, read: rd, readRate: rate(rd, r) };
  });
  const byAudience = ['ALL', 'BRANCH', 'DEPARTMENT', 'ROLE'].map((a) => ({ audience: a, count: list.filter((b: (typeof list)[number]) => b.audience === a).length }));
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { label: d.toLocaleDateString('en-NG', { month: 'short', year: '2-digit' }), count: list.filter((b: (typeof list)[number]) => new Date(b.createdAt).toISOString().slice(0, 7) === key).length };
  });
  const rated = started.filter((b: (typeof list)[number]) => b.readRate !== null && b.reach > 0);
  const actions: { priority: 1 | 2 | 3; title: string; detail: string; href: string }[] = [];
  for (const b of list.filter((x: (typeof list)[number]) => x.state === 'LIVE' && ['URGENT', 'SECURITY_ALERT'].includes(x.category) && x.read < x.reach)) {
    actions.push({ priority: 1, title: `${b.title}: ${b.reach - b.read} ${b.reach - b.read === 1 ? 'person has' : 'people have'} not read this alert`, detail: `${b.broadcastNumber} — consider calling or messaging them directly.`, href: `/notifications/broadcasts/${b.id}` });
  }
  for (const b of list.filter((x: (typeof list)[number]) => (x.email?.failed ?? 0) > 0)) {
    actions.push({ priority: 2, title: `${b.email!.failed} ${b.email!.failed === 1 ? 'email' : 'emails'} failed for ${b.broadcastNumber}`, detail: 'Check those staff email addresses in Users.', href: `/notifications/broadcasts/${b.id}` });
  }
  for (const b of list.filter((x: (typeof list)[number]) => x.state === 'LIVE' && x.readRate !== null && x.readRate < 30 && (+now - +new Date(x.startsAt)) > 86400000)) {
    actions.push({ priority: 3, title: `${b.title}: only ${b.readRate}% have read it`, detail: `Live for more than a day — consider emailing it, or making it Important.`, href: `/notifications/broadcasts/${b.id}` });
  }
  actions.sort((a, b) => a.priority - b.priority);
  return {
    totals: { total: list.length, live: list.filter((b: (typeof list)[number]) => b.state === 'LIVE').length, scheduled: list.filter((b: (typeof list)[number]) => b.state === 'SCHEDULED').length, ended: list.filter((b: (typeof list)[number]) => b.state === 'ENDED').length, stopped: list.filter((b: (typeof list)[number]) => b.state === 'STOPPED').length, reach, read, readRate: rate(read, reach), emailsSent: sent, emailsFailed: failed, deliveryRate: rate(sent, sent + failed) },
    byCategory, byAudience, months,
    best: [...rated].sort((a, b) => (b.readRate ?? 0) - (a.readRate ?? 0)).slice(0, 5),
    worst: [...rated].sort((a, b) => (a.readRate ?? 0) - (b.readRate ?? 0)).slice(0, 5),
    actions,
  };
}
