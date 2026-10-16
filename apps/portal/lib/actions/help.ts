'use server';

import { prisma, type Prisma } from '@ejo/database';
import { myOrganisationId, refuseDuringAssist, NOT_AVAILABLE } from '@/lib/authz/server';
import { requireUser } from './workshop';
import { withinLimit } from '@/lib/mail/account';
import { claimed } from '@/lib/integrity-core';
import { cleanReply, REPLY_MAX, SUPPORT_STATUS_FOR_CUSTOMER, type SupportStatus } from '@/lib/support-rules';
import { openTicket, supportEvent, type QueueRow } from '@/lib/support/server';
import { asAiMode, priorityFromText, readTargets } from '@/lib/support/core';
import { PLATFORM } from '@/lib/brand';

/**
 * Get help — a colleague's own requests to the people who support the
 * portal: their organisation's administrators (the "Staff help" team in the
 * Support centre), or the EJO platform team for a fault in the system.
 * Private: only the colleague, the help team's members and support managers
 * see a request (support-rules staffHelpFence). Enyo reads each one with the
 * colleague's role, recent errors and the how-to guides that fit their own
 * permissions, and answers or drafts like any support request.
 *
 * Every action works only on the signed-in person's own requests, inside
 * their organisation, and never during an assisted session (a Branch
 * Assistant does not ask for help in a colleague's name).
 */

class HelpError extends Error {}

export type HelpTo = 'organisation' | 'platform';
/** What a colleague's request is about — decides which team gets it. */
export type HelpAbout = 'portal' | 'fault' | 'complaint' | 'hr';
const asAbout = (v: unknown): HelpAbout => (v === 'fault' || v === 'complaint' || v === 'hr' ? v : 'portal');

const STAFF_HELP = 'Staff help';

/** The organisation's staff-help team, created the first time someone asks (Enyo drafts; a person answers). */
async function helpQueue(organisationId: string): Promise<QueueRow> {
  const sel = { id: true, name: true, kind: true, aiMode: true, autoAcknowledge: true, targets: true, signature: true, branchId: true, isDefault: true } as const;
  const found = await prisma.supportQueue.findFirst({ where: { organisationId, kind: 'internal', active: true }, orderBy: { createdAt: 'asc' }, select: sel });
  const q = found ?? await prisma.supportQueue.upsert({
    where: { organisationId_name: { organisationId, name: STAFF_HELP } },
    create: { organisationId, name: STAFF_HELP, kind: 'internal', aiMode: 'SUGGEST', autoAcknowledge: false },
    update: { active: true, kind: 'internal' },
    select: sel,
  });
  return { ...q, aiMode: asAiMode(q.aiMode), targets: readTargets(q.targets) };
}

/**
 * The team for a colleague's request: a complaint goes to Customer care (a
 * team of kind customer_care), an HR question to HR & people (kind hr), when
 * the organisation has such a team; everything else — and those, when it does
 * not — to Staff help.
 */
async function routeHelp(organisationId: string, about: HelpAbout): Promise<QueueRow> {
  const kind = about === 'complaint' ? 'customer_care' : about === 'hr' ? 'hr' : null;
  if (kind) {
    const q = await prisma.supportQueue.findFirst({
      where: { organisationId, kind, active: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, kind: true, aiMode: true, autoAcknowledge: true, targets: true, signature: true, branchId: true, isDefault: true },
    });
    if (q) return { ...q, aiMode: asAiMode(q.aiMode), targets: readTargets(q.targets) };
  }
  return helpQueue(organisationId);
}

async function me() {
  await refuseDuringAssist('help');
  const user = await requireUser();
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new HelpError('Your account is not placed in an organisation yet. Ask your administrator.');
  const u = await prisma.user.findFirst({ where: { id: user.id, organisationId }, select: { id: true, fullName: true, email: true, branchId: true } });
  if (!u) throw new HelpError(NOT_AVAILABLE);
  return { ...u, organisationId };
}

export type HelpRow = { id: string; number: string; subject: string; status: string; statusLabel: string; createdAt: Date; updatedAt: Date; to: HelpTo; answered: boolean };

export async function listMyHelpRequests(): Promise<HelpRow[]> {
  const m = await me();
  const rows = await prisma.supportTicket.findMany({
    where: { organisationId: m.organisationId, requesterUserId: m.id },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: { id: true, number: true, subject: true, status: true, createdAt: true, updatedAt: true, tags: true, replies: { where: { kind: { in: ['AGENT', 'AI'] }, visibility: 'PUBLIC' }, take: 1, select: { id: true } } },
  });
  return rows.map((r) => ({
    id: r.id, number: r.number, subject: r.subject, status: r.status, statusLabel: SUPPORT_STATUS_FOR_CUSTOMER[r.status as SupportStatus] ?? r.status,
    createdAt: r.createdAt, updatedAt: r.updatedAt, to: r.tags.includes('platform') ? 'platform' : 'organisation', answered: r.replies.length > 0,
  }));
}

export type HelpDetail = {
  id: string; number: string; subject: string; status: string; statusLabel: string; createdAt: Date; to: HelpTo;
  messages: { id: string; mine: boolean; author: string; body: string; at: Date; ai: boolean }[];
  /** Enyo answered and the colleague has not said yet whether it helped. */
  askHelped: boolean;
};

export async function getMyHelpRequest(id: string): Promise<HelpDetail> {
  const m = await me();
  const t = typeof id === 'string' && id ? await prisma.supportTicket.findFirst({
    where: { id, organisationId: m.organisationId, requesterUserId: m.id },
    select: {
      id: true, number: true, subject: true, status: true, createdAt: true, tags: true, aiOutcome: true,
      replies: { where: { visibility: 'PUBLIC', kind: { in: ['CUSTOMER', 'AGENT', 'AI'] } }, orderBy: { createdAt: 'asc' }, take: 300, select: { id: true, fromCustomer: true, kind: true, body: true, createdAt: true, authorUserId: true } },
    },
  }) : null;
  if (!t) throw new HelpError(NOT_AVAILABLE);
  const authors = [...new Set(t.replies.map((r) => r.authorUserId).filter((x): x is string => Boolean(x)))];
  const names = new Map((authors.length ? await prisma.user.findMany({ where: { id: { in: authors } }, select: { id: true, fullName: true, roles: { select: { role: { select: { isSuperAdmin: true } } } } } }) : [])
    .map((u) => [u.id, u.roles.some((r) => r.role.isSuperAdmin) ? 'Platform support' : u.fullName]));
  return {
    id: t.id, number: t.number, subject: t.subject, status: t.status, statusLabel: SUPPORT_STATUS_FOR_CUSTOMER[t.status as SupportStatus] ?? t.status, createdAt: t.createdAt,
    to: t.tags.includes('platform') ? 'platform' : 'organisation',
    messages: t.replies.map((r) => ({ id: r.id, mine: r.fromCustomer, author: r.fromCustomer ? 'You' : r.kind === 'AI' ? `${PLATFORM.assistant} (AI)` : (r.authorUserId ? names.get(r.authorUserId) : null) ?? 'Support team', body: r.body, at: r.createdAt, ai: r.kind === 'AI' })),
    askHelped: t.aiOutcome === 'ANSWERED',
  };
}

/** Ask for help. `ref`: the reference on an error screen; `page`: where it happened. */
export async function openHelpRequest(input: { subject?: string; body?: string; to?: string; about?: string; ref?: string; page?: string }): Promise<{ id: string; number: string }> {
  const m = await me();
  if (!withinLimit(`help:${m.id}`, 10, 24 * 3_600_000)) throw new HelpError('You have asked for help 10 times today. Please wait for an answer, or call your administrator.');
  const subject = String(input.subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const text = cleanReply(input.body);
  if (subject.length < 3) throw new HelpError('Say in a few words what you need help with.');
  if (text.length < 5) throw new HelpError('Describe what you were doing and what happened.');
  if (text.length > REPLY_MAX) throw new HelpError(`At most ${REPLY_MAX.toLocaleString('en-NG')} characters.`);
  const about = asAbout(input.about ?? (input.to === 'platform' ? 'fault' : 'portal'));
  const to: HelpTo = about === 'fault' || input.to === 'platform' ? 'platform' : 'organisation';
  const ref = typeof input.ref === 'string' && /^[A-Za-z0-9-]{4,40}$/.test(input.ref) ? input.ref : null;
  const page = typeof input.page === 'string' && /^\/[\w\-/[\]?=&.%]{0,200}$/.test(input.page) ? input.page : null;
  const body = [text, ref ? `Error reference: ${ref}` : '', page ? `Page: ${page}` : ''].filter(Boolean).join('\n\n');
  const queue = await routeHelp(m.organisationId, about);
  // One transaction: the request is private (requesterUserId) and has its first message from the moment it exists.
  const created = await prisma.$transaction(async (tx) => {
    const t = await openTicket({
      organisationId: m.organisationId, channel: 'STAFF', queue, branchId: m.branchId, contactName: m.fullName, contactEmail: m.email, subject, summary: text.slice(0, 600),
      priority: priorityFromText(`${subject}\n${text}`, ref || about === 'complaint' ? 'HIGH' : 'NORMAL'), verified: true, authenticatedSender: true,
      aiPending: queue.aiMode !== 'OFF', handoverReason: 'staff_help', openedAt: new Date(),
      requesterUserId: m.id, senderKind: 'staff', senderUserId: m.id, tags: [...(to === 'platform' ? ['platform'] : []), 'staff_help', `about:${about}`, ...(about === 'complaint' ? ['complaint'] : [])],
    }, tx);
    await tx.supportReply.create({ data: { ticketId: t.id, fromCustomer: true, kind: 'CUSTOMER', visibility: 'PUBLIC', body } });
    return t;
  });
  await supportEvent({ organisationId: m.organisationId, ticketId: created.id, userId: m.id, action: 'support.help_requested', metadata: { number: created.number, to, about, team: queue.name, ...(ref ? { ref } : {}) } });
  return { id: created.id, number: created.number };
}

/** Write more on my own request (it goes back to the team). */
export async function replyToMyHelpRequest(id: string, body: string): Promise<void> {
  const m = await me();
  const text = cleanReply(body);
  if (text.length < 2) throw new HelpError('Write your message first.');
  if (text.length > REPLY_MAX) throw new HelpError(`At most ${REPLY_MAX.toLocaleString('en-NG')} characters.`);
  if (!withinLimit(`help-reply:${m.id}`, 40, 3_600_000)) throw new HelpError('Too many messages in an hour. Please wait for an answer.');
  const t = await prisma.supportTicket.findFirst({ where: { id, organisationId: m.organisationId, requesterUserId: m.id }, select: { id: true, number: true, status: true } });
  if (!t) throw new HelpError(NOT_AVAILABLE);
  const now = new Date();
  const reopen = t.status === 'RESOLVED' || t.status === 'CLOSED';
  // Compare-and-set on the status read above: a colleague's change in between → "refresh and try again".
  await prisma.$transaction(async (tx) => {
    claimed(await tx.supportTicket.updateMany({
      where: { id: t.id, status: t.status },
      data: { status: 'OPEN', lastCustomerAt: now, pendingSince: null, nudgeCount: 0, ...(reopen ? { reopenCount: { increment: 1 }, resolvedAt: null, closedAt: null } : {}) } as Prisma.SupportTicketUpdateManyMutationInput,
    }));
    await tx.supportReply.create({ data: { ticketId: t.id, fromCustomer: true, kind: 'CUSTOMER', visibility: 'PUBLIC', body: text } });
  });
  await supportEvent({ organisationId: m.organisationId, ticketId: t.id, userId: m.id, action: reopen ? 'support.reopened' : 'support.customer_replied', metadata: { number: t.number, actor: 'colleague' } });
}

/** "This solved it" / "I still need a person" on Enyo's answer. */
export async function answerMyHelpRequest(id: string, choice: string): Promise<'solved' | 'person'> {
  const m = await me();
  const t = await prisma.supportTicket.findFirst({ where: { id, organisationId: m.organisationId, requesterUserId: m.id }, select: { id: true, number: true, status: true, aiOutcome: true, handoverReason: true } });
  if (!t) throw new HelpError(NOT_AVAILABLE);
  const now = new Date();
  if (choice === 'solved') {
    await prisma.supportTicket.updateMany({ where: { id: t.id, status: t.status }, data: { status: 'RESOLVED', resolvedAt: now, pendingSince: null, ...(t.aiOutcome === 'ANSWERED' || t.aiOutcome === 'ASSUMED' ? { aiOutcome: 'CONFIRMED' } : {}) } });
    await supportEvent({ organisationId: m.organisationId, ticketId: t.id, userId: m.id, action: 'support.customer_confirmed', metadata: { number: t.number, actor: 'colleague' } });
    return 'solved';
  }
  const reasons = [...new Set([...(t.handoverReason ?? '').split(',').filter(Boolean), 'customer_asked'])].join(',');
  await prisma.supportTicket.updateMany({ where: { id: t.id, status: t.status }, data: { status: 'OPEN', pendingSince: null, lastCustomerAt: now, handoverReason: reasons, ...(t.aiOutcome === 'ANSWERED' || t.aiOutcome === 'ASSUMED' ? { aiOutcome: 'ESCALATED' } : {}) } });
  await supportEvent({ organisationId: m.organisationId, ticketId: t.id, userId: m.id, action: 'support.customer_asked_person', metadata: { number: t.number, actor: 'colleague' } });
  return 'person';
}
