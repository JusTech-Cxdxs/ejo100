import 'server-only';
import { prisma } from '@ejo/database';
import { sendEmail } from '@/lib/email';
import { portalBaseUrl } from '@/lib/portal-url';
import { logFailure } from '@/lib/log';
import { formatDateTime } from '@/lib/utils/format-date';
import { renderSupportAssignedEmail, renderSupportLateEmail, renderSupportNobodyFreeEmail } from '@/lib/email-templates/support-staff';
import { CHANNEL_LABEL, PRIORITY_LABEL, asPriority } from './core';
import { letterheadFor, supportEvent } from './server';

/**
 * Colleagues hear about support requests by email at their own address, as
 * well as in the bell:
 *  - the person a request is given to (automatically or by a colleague);
 *  - the team's leads (and, when the team has none, the support managers)
 *    when nobody on the team can take a new request, and when a request
 *    misses its first-answer target.
 * Each email names the request and links to it; the messages stay behind
 * sign-in. Never throws: a failed email is logged and the work carries on.
 */

type TicketFacts = { id: string; organisationId: string; number: string; subject: string; contactName: string; channel: string; priority: string; dueFirstResponseAt: Date | null; branchId: string | null; queueId: string | null; assignedToId: string | null; requesterUserId: string | null };

const select = { id: true, organisationId: true, number: true, subject: true, contactName: true, channel: true, priority: true, dueFirstResponseAt: true, branchId: true, queueId: true, assignedToId: true, requesterUserId: true } as const;

async function base(t: TicketFacts, recipientName: string | null) {
  const [head, queue] = await Promise.all([
    letterheadFor(t.organisationId, t.branchId),
    t.queueId ? prisma.supportQueue.findFirst({ where: { id: t.queueId, organisationId: t.organisationId }, select: { name: true } }) : null,
  ]);
  return {
    companyName: head.companyName, logoUrl: head.logoUrl, recipientName, number: t.number, subject: t.subject,
    // A colleague's own help request: their name stays inside the portal.
    contactName: t.requesterUserId ? 'A colleague (Get help)' : t.contactName,
    teamName: queue?.name ?? 'Support', priority: PRIORITY_LABEL[asPriority(t.priority)], due: t.dueFirstResponseAt ? formatDateTime(t.dueFirstResponseAt) : null,
    url: `${portalBaseUrl()}/crm/support/${t.id}`, channel: CHANNEL_LABEL[t.channel] ?? t.channel,
  };
}

/** The leads of the ticket's team; when it has none, the organisation's support managers (support.manage). At most 10 people. */
async function leadsFor(t: TicketFacts): Promise<{ id: string; fullName: string; email: string }[]> {
  const leads = t.queueId ? await prisma.supportQueueMember.findMany({ where: { queueId: t.queueId, organisationId: t.organisationId, isLead: true }, select: { userId: true } }).catch(() => []) : [];
  const ids = leads.map((l) => l.userId);
  if (ids.length) return prisma.user.findMany({ where: { id: { in: ids }, organisationId: t.organisationId, isActive: true }, select: { id: true, fullName: true, email: true }, take: 10 });
  // No leads: people whose roles set up the Support centre or head customer care.
  return prisma.user.findMany({
    where: { organisationId: t.organisationId, isActive: true, roles: { some: { role: { slug: { in: ['customer-care-lead', 'administrator'] } } } } },
    select: { id: true, fullName: true, email: true }, take: 10, orderBy: { fullName: 'asc' },
  });
}

/** The request is now someone's: email them (not when they took it themselves). */
export async function emailAssignee(ticketId: string, byUserId: string | null = null): Promise<boolean> {
  try {
    const t = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select });
    if (!t?.assignedToId || t.assignedToId === byUserId) return false;
    const [who, by] = await Promise.all([
      prisma.user.findFirst({ where: { id: t.assignedToId, organisationId: t.organisationId, isActive: true }, select: { fullName: true, email: true } }),
      byUserId ? prisma.user.findUnique({ where: { id: byUserId }, select: { fullName: true } }) : null,
    ]);
    if (!who?.email) return false;
    const m = renderSupportAssignedEmail({ ...(await base(t, who.fullName)), by: by?.fullName ?? null });
    await sendEmail(who.email, m.subject, m.html);
    return true;
  } catch (err) {
    logFailure('Support: assignment email failed', ticketId, err);
    return false;
  }
}

/** Nobody on the team could take it: tell the leads (once per request). */
export async function alertNobodyFree(ticketId: string, reason: string): Promise<number> {
  try {
    const t = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { ...select, tags: true } });
    if (!t || t.assignedToId || t.tags.includes('nobody_free_alerted')) return 0;
    const claimed = await prisma.supportTicket.updateMany({ where: { id: t.id, assignedToId: null, NOT: { tags: { has: 'nobody_free_alerted' } } }, data: { tags: { push: 'nobody_free_alerted' } } });
    if (!claimed.count) return 0;
    const people = await leadsFor(t);
    let sent = 0;
    for (const p of people) {
      const m = renderSupportNobodyFreeEmail({ ...(await base(t, p.fullName)), reason });
      await sendEmail(p.email, m.subject, m.html).then(() => { sent += 1; }).catch((err) => logFailure('Support: nobody-free email failed', t.number, err));
    }
    await supportEvent({ organisationId: t.organisationId, ticketId: t.id, action: 'support.nobody_free', metadata: { number: t.number, reason, told: sent } });
    return sent;
  } catch (err) {
    logFailure('Support: nobody-free alert failed', ticketId, err);
    return 0;
  }
}

/** Why nobody could take a new request on this team (for the leads' email). */
export async function whyNobodyFree(organisationId: string, queueId: string | null): Promise<string> {
  if (!queueId) return 'the request has no team yet';
  const members = await prisma.supportQueueMember.findMany({ where: { queueId, organisationId }, select: { away: true } }).catch(() => []);
  if (!members.length) return 'nobody is on the team';
  if (members.every((m) => m.away)) return 'everyone on the team is marked away';
  return 'everyone available already has as many open requests as they take';
}

/** Past its first-answer target: tell the owner and the leads. */
export async function emailLate(ticketId: string): Promise<number> {
  try {
    const t = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select });
    if (!t) return 0;
    const [owner, leads] = await Promise.all([
      t.assignedToId ? prisma.user.findFirst({ where: { id: t.assignedToId, organisationId: t.organisationId, isActive: true }, select: { id: true, fullName: true, email: true } }) : null,
      leadsFor(t),
    ]);
    const people = [...(owner ? [owner] : []), ...leads.filter((l) => l.id !== owner?.id)];
    let sent = 0;
    for (const p of people) {
      const m = renderSupportLateEmail({ ...(await base(t, p.fullName)), owner: owner && owner.id !== p.id ? owner.fullName : null });
      await sendEmail(p.email, m.subject, m.html).then(() => { sent += 1; }).catch((err) => logFailure('Support: late email failed', t.number, err));
    }
    return sent;
  } catch (err) {
    logFailure('Support: late alert failed', ticketId, err);
    return 0;
  }
}

/** After a request was opened or routed: the owner is told, or — when there is none — the leads. */
export async function announceRouted(ticketId: string): Promise<void> {
  const t = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { organisationId: true, queueId: true, assignedToId: true } }).catch(() => null);
  if (!t) return;
  if (t.assignedToId) await emailAssignee(ticketId);
  else await alertNobodyFree(ticketId, await whyNobodyFree(t.organisationId, t.queueId));
}
