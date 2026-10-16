import 'server-only';
/**
 * Gathers a person's brief from the same lists they see elsewhere, each built
 * by its module with the person's own permissions and reach: decisions and
 * steps (dashboard / Approvals), open jobs, appointments, reminders, their
 * support requests, their own mail (never during an assisted session), new
 * activity and announcements. Every item carries the link to act on it.
 */
import { prisma } from '@ejo/database';
import { allows, currentAssist, myOrganisationId, reachWhere } from '@/lib/authz/server';
import { getDashboardNotifications } from '@/lib/actions/dashboard';
import { getMyJobs } from '@/lib/actions/my-work';
import { listCalendar } from '@/lib/actions/scheduling';
import { getActivityFeed, getMyBroadcasts } from '@/lib/actions/notifications';
import { approvalArea } from '@/lib/approvals';
import { ticketReachWhere } from '@/lib/support-rules';
import { dueLabel } from '@/lib/support/core';
import { requireUser } from '@/lib/actions/workshop';
import { greetingFor, type BriefData, type BriefItem, type BriefSection } from './core';
import { fenceStaffHelp } from '@/lib/support/reach';

const DAY = 86_400_000;
const lagos = (d: Date) => d.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const time = (d: Date) => d.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' });
const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

export async function collectBrief(period: { from: Date | null; to: Date; label: string }): Promise<BriefData> {
  const user = await requireUser();
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
  // When in doubt, treat it as an assisted session (no mail, no decisions).
  const assisting = await currentAssist().then(Boolean).catch(() => true);
  const now = period.to;
  const lagosMidnight = new Date(`${now.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })}T00:00:00+01:00`);
  const calFrom = period.from && period.from < lagosMidnight ? period.from : lagosMidnight;
  const calTo = period.from ? new Date(Math.max(now.getTime(), lagosMidnight.getTime() + DAY)) : new Date(lagosMidnight.getTime() + DAY);

  const reminderWindow = { ownerId: user.id, status: 'PENDING' as const, dueAt: { lte: new Date(Math.max(now.getTime(), lagosMidnight.getTime() + DAY)) } };
  const [actions, jobs, calendar, reminders, support, mail, activity, broadcasts, reminderTotal] = await Promise.all([
    safe(getDashboardNotifications() as Promise<{ id: string; title: string; detail: string; url: string; createdAt: Date }[]>, []),
    safe(getMyJobs(), []),
    safe(listCalendar(calFrom, calTo) as Promise<{ id: string; title: string; startsAt: Date; status: string; room: { name: string } | null; location: string | null }[]>, []),
    safe(prisma.reminder.findMany({ where: reminderWindow, orderBy: { dueAt: 'asc' }, take: 20, select: { id: true, title: true, dueAt: true } }), []),
    supportFor(user.id),
    assisting ? Promise.resolve(null) : mailFor(user.id, period.from),
    safe(getActivityFeed({ unreadOnly: true, take: 60 }) as Promise<{ id: string; title: string; detail: string | null; url: string; at: Date; read: boolean }[]>, []),
    safe(getMyBroadcasts(), []),
    safe(prisma.reminder.count({ where: reminderWindow }), 0),
  ]);

  const sections: BriefSection[] = [];
  const nowMs = Date.now();
  const shape = (n: { title: string; detail: string; url: string; createdAt: Date }): BriefItem => {
    const days = Math.floor((nowMs - new Date(n.createdAt).getTime()) / DAY);
    return { title: n.title, detail: n.detail || undefined, href: n.url, when: days > 0 ? `waiting ${days} day${days === 1 ? '' : 's'}` : 'today', overdue: days >= 3 };
  };
  const oldest = (a: { createdAt: Date }, b: { createdAt: Date }) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  const decisions = assisting ? [] : actions.filter((a) => approvalArea(a) !== null).sort(oldest).map(shape);
  const decisionIds = new Set(actions.filter((a) => approvalArea(a) !== null).map((a) => a.id));
  const steps = actions.filter((a) => !decisionIds.has(a.id) && !a.id.startsWith('support-')).sort(oldest).map(shape);
  sections.push({ key: 'decisions', title: 'Decisions waiting for you', count: decisions.length, overdue: decisions.filter((d) => d.overdue).length, items: decisions.slice(0, 8), href: '/approvals' });
  sections.push({ key: 'steps', title: 'Other steps to take', count: steps.length, overdue: steps.filter((d) => d.overdue).length, items: steps.slice(0, 8), href: '/dashboard' });
  if (support) sections.push(support);
  const overdueReminders = reminders.filter((r) => r.dueAt.getTime() < nowMs);
  sections.push({
    key: 'reminders', title: 'Reminders due', count: reminderTotal, overdue: overdueReminders.length,
    items: reminders.slice(0, 8).map((r) => ({ title: r.title, href: '/reminders', when: r.dueAt.getTime() < nowMs ? `was due ${lagos(r.dueAt)}` : `due ${time(r.dueAt)}`, overdue: r.dueAt.getTime() < nowMs })),
    href: '/reminders',
  });
  const appts = calendar.filter((a) => a.status !== 'CANCELLED' && new Date(a.startsAt) >= calFrom && new Date(a.startsAt) < calTo).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  sections.push({ key: 'appointments', title: period.from && period.from < lagosMidnight ? 'Appointments' : 'Appointments today', count: appts.length, items: appts.slice(0, 8).map((a) => ({ title: a.title, href: `/schedule/${a.id}`, when: lagos(new Date(a.startsAt)), detail: a.room?.name ?? a.location ?? undefined })), href: '/schedule' });
  sections.push({ key: 'jobs', title: 'Your open jobs', count: jobs.length, items: jobs.slice(0, 8).map((j) => ({ title: `${j.number}${j.vehicle ? ` — ${j.vehicle}` : ''}`, detail: `${j.as}, ${j.status.replace(/_/g, ' ').toLowerCase()}`, href: j.url })), href: '/dashboard' });
  if (mail) sections.push(mail);
  const fresh = activity.filter((a) => !a.read && (!period.from || new Date(a.at) >= period.from));
  sections.push({ key: 'activity', title: period.from ? `New notifications ${period.label}` : 'Unread notifications', count: fresh.length, ...(activity.length >= 60 && !period.from ? { countLabel: '60+' } : {}), items: fresh.slice(0, 6).map((a) => ({ title: a.title, detail: a.detail ?? undefined, href: a.url || '/notifications', when: lagos(new Date(a.at)) })), href: '/notifications' });
  const unreadBc = broadcasts.filter((b) => !b.read);
  sections.push({ key: 'broadcasts', title: 'Unread announcements', count: unreadBc.length, items: unreadBc.slice(0, 4).map((b) => ({ title: b.title, href: '/notifications', when: lagos(new Date(b.startsAt)) })), href: '/notifications' });

  return {
    name: (me?.fullName ?? 'there').split(/\s+/)[0] ?? 'there',
    greeting: greetingFor(new Date()),
    periodLabel: period.label,
    from: period.from?.toISOString() ?? null,
    to: now.toISOString(),
    sections,
  };
}

/** The person's own support requests that need an answer, and late ones in their teams. */
async function supportFor(userId: string): Promise<BriefSection | null> {
  if (!(await allows('support.tickets.manage').catch(() => false))) return null;
  const reach = (await fenceStaffHelp(ticketReachWhere(await reachWhere('support.tickets.manage'), await myOrganisationId())));
  const queues = (await prisma.supportQueueMember.findMany({ where: { userId }, select: { queueId: true } }).catch(() => [])).map((q) => q.queueId);
  const rows = await prisma.supportTicket.findMany({
    where: { AND: [reach as object, { status: { in: ['OPEN', 'ON_HOLD'] } }, { OR: [{ assignedToId: userId }, ...(queues.length ? [{ queueId: { in: queues }, assignedToId: null }] : [])] }] },
    orderBy: [{ dueFirstResponseAt: { sort: 'asc', nulls: 'last' } }],
    take: 30,
    select: { id: true, number: true, subject: true, contactName: true, priority: true, firstResponseAt: true, dueFirstResponseAt: true, assignedToId: true },
  }).catch(() => []);
  const now = new Date();
  const late = rows.filter((r) => !r.firstResponseAt && r.dueFirstResponseAt && r.dueFirstResponseAt < now);
  const total = rows.length < 30 ? rows.length : await prisma.supportTicket.count({ where: { AND: [reach as object, { status: { in: ['OPEN', 'ON_HOLD'] } }, { OR: [{ assignedToId: userId }, ...(queues.length ? [{ queueId: { in: queues }, assignedToId: null }] : [])] }] } }).catch(() => rows.length);
  return {
    key: 'support', title: 'Support requests for you', count: total, overdue: late.length,
    items: rows.slice(0, 8).map((r) => ({
      title: `${r.number} — ${r.contactName}`, detail: `${r.priority === 'URGENT' ? 'URGENT: ' : ''}${r.subject}${r.assignedToId ? '' : ' (not assigned yet)'}`,
      href: `/crm/support/${r.id}`, when: r.dueFirstResponseAt && !r.firstResponseAt ? `first answer ${dueLabel(r.dueFirstResponseAt, now)}` : undefined, overdue: late.includes(r),
    })),
    href: '/crm/support?filter=mine',
  };
}

/** The person's own mailbox: unread mail in the period, the ones Enyo flagged as needing them first. */
async function mailFor(userId: string, from: Date | null): Promise<BriefSection | null> {
  const organisationId = await myOrganisationId();
  const box = await prisma.mailAccount.findFirst({ where: { userId, ...(organisationId ? { organisationId } : {}), status: { not: 'DISCONNECTED' } }, select: { id: true } }).catch(() => null);
  if (!box) return null;
  const rows = await prisma.mailMessage.findMany({
    where: { accountId: box.id, seen: false, ...(from ? { receivedAt: { gte: from } } : {}) },
    orderBy: [{ aiPriority: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'desc' }],
    take: 40,
    select: { id: true, subject: true, fromName: true, fromAddress: true, receivedAt: true, aiPriority: true, aiSummary: true },
  }).catch(() => []);
  const total = rows.length < 40 ? rows.length : await prisma.mailMessage.count({ where: { accountId: box.id, seen: false, ...(from ? { receivedAt: { gte: from } } : {}) } }).catch(() => rows.length);
  return {
    key: 'mail', title: from ? 'Unread mail in this period' : 'Unread mail', count: total, overdue: rows.filter((r) => r.aiPriority === 1).length,
    items: rows.slice(0, 6).map((r) => ({ title: r.subject, detail: `from ${r.fromName ?? r.fromAddress}${r.aiPriority === 1 ? ' — needs you today' : ''}`, href: `/mail?m=${r.id}`, when: lagos(r.receivedAt), overdue: r.aiPriority === 1 })),
    href: '/mail',
  };
}
