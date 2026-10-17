'use server';

import { prisma, type Prisma } from '@ejo/database';
import { authorize, allows, getPrincipal, myOrganisationId, reachWhere, NOT_AVAILABLE } from '@/lib/authz/server';
import { decide, type Principal, PERMISSIONS, type PermissionKey } from '@/lib/authz/catalogue';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { claimed } from '@/lib/integrity-core';
import { sendEmail } from '@/lib/email';
import { logError } from '@/lib/errors';
import { portalBaseUrl, websiteBaseUrl } from '@/lib/portal-url';
import { renderCustomerSupportReplyEmail } from '@/lib/email-templates/customer-support-reply';
import { renderSupportReply } from '@/lib/email-templates/support-centre';
import { resolveMailRefs, type ResolvedRef } from '@/lib/mail/refs';
import {
  cleanReply, filterWhere, isSupportStatus, REPLY_MAX, SUPPORT_STATUS_FOR_CUSTOMER, SUPPORT_STATUS_LABEL, supportFilter, ticketReachWhere, waitLabel,
  type SupportFilter, type SupportStatus,
} from '@/lib/support-rules';
import {
  asPriority, dueDates, dueLabel, extractEntities, PRIORITIES, PRIORITY_LABEL, reasonLabels, slaState, type Entities, type Priority, type SlaState,
} from '@/lib/support/core';
import { TOPIC_LABEL, asTopic } from '@/lib/support/ai-core';
import { aiReply, aiSummary, followUrl, letterheadFor, openTicket, queueById, responseUrl, sendFromSupport, subjectFor, supportEvent, supportSettings } from '@/lib/support/server';
import { learnFromResolution } from '@/lib/support/learn';
import { draftUse } from '@/lib/support/monitor-core';
import { senderContext } from '@/lib/support/context';
import { senderView, type SenderView } from '@/lib/support/context-core';
import { PLATFORM } from '@/lib/brand';
import { fenceStaffHelp } from '@/lib/support/reach';
import { after } from 'next/server';
import { announceRouted, emailAssignee } from '@/lib/support/notify';

/**
 * The Support centre for colleagues: customers and visitors handed over by
 * Enyo, and emails to the support addresses. Every action needs
 * support.tickets.manage and works only on tickets of the person's
 * organisation within their branch reach (tickets with no branch are the
 * whole organisation's). Replies are emailed to the customer from the
 * ticket's support address (threaded, in the letterhead) and show in their
 * customer portal; internal notes and Enyo's drafts never reach the
 * customer. Every change is in the audit trail without the message text.
 */

class SupportError extends Error {}

const PERM: PermissionKey = 'support.tickets.manage';

type Where = Prisma.SupportTicketWhereInput;

export type SupportInboxRow = {
  id: string; number: string; status: SupportStatus; statusLabel: string; channel: string;
  contactName: string; customerId: string | null; subject: string; createdAt: Date; updatedAt: Date;
  assignedTo: string | null; mine: boolean; branchName: string | null; firstResponse: string | null; lastFromCustomer: boolean;
  priority: Priority; queueName: string | null; topic: string | null; sla: SlaState; due: string | null; aiOutcome: string | null; sentiment: string | null;
};

export type SupportInbox = {
  filter: SupportFilter;
  queueId: string | null;
  rows: SupportInboxRow[];
  counts: Record<'open' | 'unassigned' | 'mine' | 'late' | 'waiting' | 'on_hold' | 'resolved', number>;
  queues: { id: string; name: string; open: number }[];
  canCrm: boolean;
  canManage: boolean;
};

export async function getSupportInbox(input: { filter?: string; q?: string; queue?: string; priority?: string } = {}): Promise<SupportInbox> {
  await authorize(PERM, undefined, 'getSupportInbox');
  const me = await requireUser();
  const reach = (await fenceStaffHelp(ticketReachWhere(await reachWhere(PERM), await myOrganisationId()))) as Where;
  const organisationId = await myOrganisationId();
  const filter = supportFilter(input.filter);
  const queueId = typeof input.queue === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(input.queue) ? input.queue : null;
  const priority = typeof input.priority === 'string' && (PRIORITIES as readonly string[]).includes(input.priority) ? input.priority : null;
  const q = typeof input.q === 'string' ? input.q.trim().slice(0, 60) : '';
  const search: Where = q
    ? { OR: [{ number: { contains: q, mode: 'insensitive' } }, { contactName: { contains: q, mode: 'insensitive' } }, { subject: { contains: q, mode: 'insensitive' } }, { contactPhone: { contains: q } }, { contactEmail: { contains: q, mode: 'insensitive' } }, { tags: { has: q.toLowerCase() } }] }
    : {};
  const narrow: Where = { ...(queueId ? { queueId } : {}), ...(priority ? { priority } : {}) };
  const now = new Date();
  const countOf = (f: SupportFilter) => prisma.supportTicket.count({ where: { AND: [reach, narrow, filterWhere(f, me.id, now) as Where] } });
  const [rows, open, unassigned, mine, late, waiting, onHold, resolved, canCrm, canManage, queues, perQueue] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { AND: [reach, narrow, filterWhere(filter, me.id, now) as Where, search] },
      // Late and urgent first, then the oldest waiting.
      orderBy: filter === 'resolved' ? [{ updatedAt: 'desc' }] : [{ dueFirstResponseAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 150,
      select: {
        id: true, number: true, status: true, channel: true, contactName: true, customerId: true, subject: true, createdAt: true, updatedAt: true,
        assignedToId: true, branchId: true, firstResponseAt: true, dueFirstResponseAt: true, priority: true, queueId: true, topic: true, aiOutcome: true, sentiment: true,
        replies: { where: { kind: { in: ['CUSTOMER', 'AGENT', 'AI'] } }, orderBy: { createdAt: 'desc' }, take: 1, select: { fromCustomer: true } },
      },
    }),
    countOf('open'), countOf('unassigned'), countOf('mine'), countOf('late'), countOf('waiting'), countOf('on_hold'), countOf('resolved'),
    allows('crm.view'), allows('support.manage'),
    organisationId ? prisma.supportQueue.findMany({ where: { organisationId, active: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], select: { id: true, name: true } }) : [],
    prisma.supportTicket.groupBy({ by: ['queueId'], where: { AND: [reach, { status: { in: ['OPEN', 'ON_HOLD'] } }] }, _count: { _all: true } }),
  ]);
  // Urgent first within the same due time.
  const rank: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
  if (filter !== 'resolved') rows.sort((a, b) => (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2) || (a.dueFirstResponseAt?.getTime() ?? Infinity) - (b.dueFirstResponseAt?.getTime() ?? Infinity));
  const userIds = [...new Set(rows.map((r) => r.assignedToId).filter((x): x is string => Boolean(x)))];
  const branchIds = [...new Set(rows.map((r) => r.branchId).filter((x): x is string => Boolean(x)))];
  const [users, branches] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : [],
    branchIds.length ? prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } }) : [],
  ]);
  const name = new Map(users.map((u) => [u.id, u.fullName]));
  const bname = new Map(branches.map((b) => [b.id, b.name]));
  const qname = new Map(queues.map((x) => [x.id, x.name]));
  const qopen = new Map(perQueue.map((x) => [x.queueId, x._count._all]));
  return {
    filter, queueId, canCrm, canManage,
    counts: { open, unassigned, mine, late, waiting, on_hold: onHold, resolved },
    queues: queues.map((x) => ({ ...x, open: qopen.get(x.id) ?? 0 })),
    rows: rows.map((r) => {
      const sla = slaState(r, now);
      return {
        id: r.id, number: r.number, status: r.status as SupportStatus, statusLabel: SUPPORT_STATUS_LABEL[r.status as SupportStatus] ?? r.status,
        channel: r.channel, contactName: r.contactName, customerId: r.customerId, subject: r.subject, createdAt: r.createdAt, updatedAt: r.updatedAt,
        assignedTo: r.assignedToId ? name.get(r.assignedToId) ?? 'A colleague' : null, mine: r.assignedToId === me.id,
        branchName: r.branchId ? bname.get(r.branchId) ?? null : null,
        firstResponse: r.firstResponseAt ? waitLabel(r.createdAt, r.firstResponseAt) : null,
        lastFromCustomer: r.replies[0]?.fromCustomer ?? true,
        priority: asPriority(r.priority), queueName: r.queueId ? qname.get(r.queueId) ?? null : null, topic: r.topic ? TOPIC_LABEL[asTopic(r.topic)] : null,
        sla, due: r.dueFirstResponseAt && !r.firstResponseAt && (sla === 'breached' || sla === 'due_soon' || sla === 'on_track') ? dueLabel(r.dueFirstResponseAt, now) : null,
        aiOutcome: r.aiOutcome, sentiment: r.sentiment,
      };
    }),
  };
}

/** Open (unassigned or mine) tickets waiting on the team — for the menu count. */
export async function countOpenSupportTickets(): Promise<number> {
  const user = await requireUser();
  if (!(await allows(PERM))) return 0;
  const reach = (await fenceStaffHelp(ticketReachWhere(await reachWhere(PERM), await myOrganisationId()))) as Where;
  return prisma.supportTicket.count({ where: { AND: [reach, { status: 'OPEN' }, { OR: [{ assignedToId: null }, { assignedToId: user.id }] }] } }).catch(() => 0);
}

export type SupportMessage = { id: string; kind: string; fromCustomer: boolean; internal: boolean; author: string; body: string; createdAt: Date; aiDrafted: boolean; attachments: { name: string; size: number }[] };

export type SupportTicketDetail = {
  id: string; number: string; status: SupportStatus; statusLabel: string; channel: string;
  contactName: string; contactPhone: string | null; contactEmail: string | null; customerId: string | null; customerName: string | null; canCrm: boolean;
  subject: string; summary: string; createdAt: Date; firstResponseAt: Date | null; firstResponse: string | null; resolvedAt: Date | null;
  branchName: string | null; assignedToId: string | null; assignedTo: string | null; mine: boolean;
  replies: SupportMessage[];
  draft: { id: string; body: string; createdAt: Date } | null;
  transcript: { id: string; role: 'customer' | 'enyo'; text: string; at: Date }[];
  colleagues: { id: string; name: string }[];
  emailTo: string | null;
  priority: Priority; queueId: string | null; queueName: string | null; queues: { id: string; name: string }[];
  topic: string | null; sentiment: string | null; language: string | null; verified: boolean;
  sla: SlaState; dueFirst: Date | null; dueLabel: string | null; dueResolve: Date | null;
  handover: string[]; aiOutcome: string | null; csat: { score: number; comment: string | null; at: Date | null } | null; reopenCount: number;
  links: ResolvedRef[]; entities: Entities;
  vehicles: { id: string; label: string; plate: string | null }[];
  jobs: { id: string; number: string; status: string; href: string }[];
  /** For "someone else wrote meanwhile" checks when sending. */
  seenAt: string;
  /** v37: who is writing (customer / colleague / both), whether it is proven, sign-in state, their records and links. */
  sender: SenderView | null;
  /** v37: a colleague's own help request. */
  colleagueRequest: boolean;
};

/** One ticket with its thread (replies, notes, Enyo's draft), the customer's context, and the conversation with Enyo — or "not available". */
export async function getSupportTicket(ticketId: string): Promise<SupportTicketDetail> {
  await authorize(PERM, undefined, 'getSupportTicket');
  const me = await requireUser();
  const reach = (await fenceStaffHelp(ticketReachWhere(await reachWhere(PERM), await myOrganisationId()))) as Where;
  const t = typeof ticketId === 'string' && ticketId ? await prisma.supportTicket.findFirst({
    where: { AND: [{ id: ticketId }, reach] },
    include: { replies: { orderBy: { createdAt: 'asc' }, take: 400 } },
  }) : null;
  if (!t) throw new SupportError(NOT_AVAILABLE);
  const authorIds = [...new Set([t.assignedToId, ...t.replies.map((r) => r.authorUserId)].filter((x): x is string => Boolean(x)))];
  const canJobs = await allows('workshop.job_card.view');
  const jobReach = canJobs ? await reachWhere('workshop.job_card.view') : null;
  const [authors, customer, branch, transcript, colleagues, canCrm, queues] = await Promise.all([
    authorIds.length ? prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, fullName: true } }) : [],
    t.customerId ? prisma.customer.findFirst({ where: { id: t.customerId, organisationId: t.organisationId }, select: { id: true, fullName: true, email: true, vehicles: { take: 6, select: { id: true, make: true, model: true, plateNumber: true } } } }) : null,
    t.branchId ? prisma.branch.findUnique({ where: { id: t.branchId }, select: { name: true } }) : null,
    t.conversationId ? prisma.enyoMessage.findMany({
      where: { conversationId: t.conversationId, conversation: { organisationId: t.organisationId }, role: { in: ['USER', 'ASSISTANT'] } },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: { id: true, role: true, content: true, createdAt: true },
    }) : [],
    colleaguesFor(t.organisationId, t.branchId),
    allows('crm.view'),
    prisma.supportQueue.findMany({ where: { organisationId: t.organisationId, active: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], select: { id: true, name: true } }),
  ]);
  const jobs = customer && jobReach ? await prisma.jobCard.findMany({ where: { AND: [{ customerId: customer.id }, jobReach as Prisma.JobCardWhereInput] }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, jobNumber: true, status: true } }) : [];
  const who = new Map(authors.map((u) => [u.id, u.fullName]));
  const entities: Entities = t.entities && typeof t.entities === 'object' ? { plates: [], vins: [], records: [], ...(t.entities as Partial<Entities>) } : extractEntities(`${t.subject}\n${t.replies.filter((r) => r.fromCustomer).map((r) => r.body).join('\n')}`);
  const links = await resolveMailRefs([
    ...entities.records.map((v) => ({ kind: 'ref' as const, value: v })),
    ...entities.plates.map((v) => ({ kind: 'plate' as const, value: v })),
    ...(t.contactEmail && !customer ? [{ kind: 'email' as const, value: t.contactEmail }] : []),
  ]).catch(() => []);
  const now = new Date();
  const sla = slaState(t, now);
  const visible = t.replies.filter((r) => r.kind !== 'AI_DRAFT');
  const drafts = t.replies.filter((r) => r.kind === 'AI_DRAFT');
  const lastDraft = drafts[drafts.length - 1];
  // A draft older than the latest customer message is out of date.
  const lastCustomer = [...t.replies].reverse().find((r) => r.fromCustomer);
  const draft = lastDraft && (!lastCustomer || lastDraft.createdAt >= lastCustomer.createdAt) ? { id: lastDraft.id, body: lastDraft.body, createdAt: lastDraft.createdAt } : null;
  const queueName = queues.find((x) => x.id === t.queueId)?.name ?? null;
  const question = `${t.subject}\n${lastCustomer?.body ?? t.summary}`.slice(0, 600);
  const ctx = await senderContext(t, question).catch(() => null);
  const sender = ctx ? senderView(ctx, { canSeeErrors: await allows('audit.view') }) : null;
  return {
    id: t.id, number: t.number, status: t.status as SupportStatus, statusLabel: SUPPORT_STATUS_LABEL[t.status as SupportStatus] ?? t.status, channel: t.channel,
    contactName: t.contactName, contactPhone: t.contactPhone, contactEmail: t.contactEmail,
    customerId: customer?.id ?? null, customerName: customer?.fullName ?? null, canCrm,
    subject: t.subject, summary: t.summary, createdAt: t.createdAt, firstResponseAt: t.firstResponseAt,
    firstResponse: t.firstResponseAt ? waitLabel(t.createdAt, t.firstResponseAt) : null, resolvedAt: t.resolvedAt,
    branchName: branch?.name ?? null, assignedToId: t.assignedToId, assignedTo: t.assignedToId ? who.get(t.assignedToId) ?? 'A colleague' : null, mine: t.assignedToId === me.id,
    replies: visible.map((r) => ({
      id: r.id, kind: r.kind, fromCustomer: r.fromCustomer, internal: r.visibility === 'INTERNAL', aiDrafted: r.aiDrafted,
      author: r.fromCustomer ? t.contactName : r.kind === 'AI' ? 'Enyo (AI)' : r.kind === 'SYSTEM' ? 'Automatic' : (r.authorUserId ? who.get(r.authorUserId) : null) ?? 'Customer care',
      body: r.body, createdAt: r.createdAt,
      attachments: Array.isArray(r.attachments) ? (r.attachments as { name: string; size: number }[]).slice(0, 20) : [],
    })),
    draft,
    transcript: transcript.filter((m) => m.content.trim()).map((m) => ({ id: m.id, role: m.role === 'USER' ? 'customer' : 'enyo', text: m.content, at: m.createdAt })),
    colleagues,
    emailTo: customer?.email ?? t.contactEmail ?? null,
    priority: asPriority(t.priority), queueId: t.queueId, queueName, queues,
    topic: t.topic ? TOPIC_LABEL[asTopic(t.topic)] : null, sentiment: t.sentiment, language: t.language, verified: t.verified,
    sla, dueFirst: t.dueFirstResponseAt, dueLabel: t.dueFirstResponseAt && !t.firstResponseAt ? dueLabel(t.dueFirstResponseAt, now) : null, dueResolve: t.dueResolutionAt,
    handover: reasonLabels(t.handoverReason), aiOutcome: t.aiOutcome,
    csat: t.csatScore !== null ? { score: t.csatScore, comment: t.csatComment, at: t.csatAt } : null, reopenCount: t.reopenCount,
    links, entities,
    vehicles: (customer?.vehicles ?? []).map((v) => ({ id: v.id, label: [v.make, v.model].filter(Boolean).join(' ') || 'Vehicle', plate: v.plateNumber })),
    jobs: jobs.map((j) => ({ id: j.id, number: j.jobNumber, status: String(j.status).replace(/_/g, ' ').toLowerCase(), href: `/workshop/job-cards/${j.id}` })),
    seenAt: (t.replies[t.replies.length - 1]?.createdAt ?? t.createdAt).toISOString(),
    sender, colleagueRequest: Boolean(t.requesterUserId),
  };
}

/** Active colleagues of the organisation who may handle this ticket (same permission, same branch rule). */
async function colleaguesFor(organisationId: string, branchId: string | null): Promise<{ id: string; name: string }[]> {
  const [users, orgBranches] = await Promise.all([
    prisma.user.findMany({
      where: { organisationId, isActive: true },
      take: 400,
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, branchId: true, departmentId: true, roles: { select: { role: { select: { slug: true, isSuperAdmin: true, permissions: { select: { permission: { select: { key: true } } } } } } } } },
    }),
    prisma.branch.findMany({ where: { businessUnit: { organisationId } }, select: { id: true } }),
  ]);
  const orgBranchIds = orgBranches.map((b) => b.id);
  const out: { id: string; name: string }[] = [];
  for (const u of users) {
    if (u.roles.some((r) => r.role.isSuperAdmin)) continue;
    const extra: Partial<Record<PermissionKey, 'BRANCH'>> = {};
    for (const r of u.roles) for (const rp of r.role.permissions) if (rp.permission.key in PERMISSIONS) extra[rp.permission.key as PermissionKey] = 'BRANCH';
    const p: Principal = { userId: u.id, isSuperAdmin: false, roleSlugs: u.roles.map((r) => r.role.slug), branchId: u.branchId, departmentId: u.departmentId, organisationId, orgBranchIds, extraGrants: extra };
    if (decide(p, PERM, branchId ? { branchId } : undefined).allowed) out.push({ id: u.id, name: u.fullName });
  }
  return out;
}

/** A ticket this person may handle, with what the actions need — or "not available". */
async function ticketForChange(ticketId: string, reach: Where) {
  const t = typeof ticketId === 'string' && ticketId ? await prisma.supportTicket.findFirst({
    where: { AND: [{ id: ticketId }, reach] },
    select: {
      id: true, number: true, status: true, organisationId: true, branchId: true, customerId: true, contactName: true, contactEmail: true, subject: true, assignedToId: true, firstResponseAt: true, channel: true,
      queueId: true, mailboxId: true, token: true, sourceMessageId: true, priority: true, createdAt: true, aiOutcome: true, handoverReason: true, requesterUserId: true, authenticatedSender: true, verified: true, topic: true,
    },
  }) : null;
  if (!t) throw new SupportError(NOT_AVAILABLE);
  return t;
}

/**
 * Answer the customer: kept on the ticket (it shows in their customer
 * portal), emailed to them — from the ticket's support address and threaded
 * when it came by email, otherwise in the branded layout — and the ticket
 * moves to `then` (default: waiting on the customer). The first answer sets
 * the first-response time; an unassigned ticket becomes the replier's.
 * `seenAt`: refused when the customer or a colleague wrote after the
 * replier opened the ticket (unless they confirm), so nobody answers blind.
 */
export async function replyToSupportTicket(ticketId: string, body: string, then: string = 'WAITING_ON_CUSTOMER', opts: { seenAt?: string; aiDrafted?: boolean; confirmNew?: boolean } = {}): Promise<{ emailed: boolean; emailTo: string | null }> {
  await authorize(PERM, undefined, 'replyToSupportTicket');
  const me = await requireUser();
  const reach = (await fenceStaffHelp(ticketReachWhere(await reachWhere(PERM), await myOrganisationId()))) as Where;
  const t = await ticketForChange(ticketId, reach);
  const text = cleanReply(body);
  if (text.length < 2) throw new SupportError('Write the reply first.');
  if (text.length > REPLY_MAX) throw new SupportError(`A reply can be at most ${REPLY_MAX.toLocaleString('en-NG')} characters.`);
  const status: SupportStatus = isSupportStatus(then) && then !== 'CLOSED' ? then : 'WAITING_ON_CUSTOMER';
  const seen = opts.seenAt ? new Date(opts.seenAt) : null;
  if (seen && !Number.isNaN(seen.getTime()) && !opts.confirmNew) {
    const since = await prisma.supportReply.count({ where: { ticketId: t.id, createdAt: { gt: seen }, kind: { in: ['CUSTOMER', 'AGENT', 'AI'] }, OR: [{ authorUserId: null }, { authorUserId: { not: me.id } }] } });
    if (since) throw new SupportError(`New message${since === 1 ? '' : 's'} arrived on this ticket after you opened it. Read ${since === 1 ? 'it' : 'them'} first, then send again.`);
  }
  const now = new Date();
  let replyId = '';
  // Compare-and-set on the status read above: a customer reply or a colleague's change in between → "refresh and try again".
  await prisma.$transaction(async (tx) => {
    claimed(await tx.supportTicket.updateMany({
      where: { id: t.id, status: t.status },
      data: {
        status,
        firstResponseAt: t.firstResponseAt ?? now,
        lastAgentAt: now,
        pendingSince: status === 'WAITING_ON_CUSTOMER' ? now : null,
        nudgeCount: 0,
        resolvedAt: status === 'RESOLVED' ? now : null,
        ...(t.assignedToId ? {} : { assignedToId: me.id }),
      },
    }));
    replyId = (await tx.supportReply.create({ data: { ticketId: t.id, authorUserId: me.id, fromCustomer: false, kind: 'AGENT', visibility: 'PUBLIC', aiDrafted: Boolean(opts.aiDrafted), body: text }, select: { id: true } })).id;
  });

  // The customer's email: a portal customer's own address (read inside the organisation), else what they wrote from.
  const customer = t.customerId ? await prisma.customer.findFirst({ where: { id: t.customerId, organisationId: t.organisationId }, select: { fullName: true, email: true } }) : null;
  const to = t.channel === 'EMAIL' ? (t.contactEmail ?? customer?.email ?? null) : (customer?.email ?? t.contactEmail ?? null);
  let emailed = false;
  if (to) {
    try {
      if (t.channel === 'EMAIL' || t.mailboxId || t.requesterUserId) {
        const [queue, head, lastIn, agent] = await Promise.all([
          queueById(t.organisationId, t.queueId),
          letterheadFor(t.organisationId, t.branchId),
          prisma.supportReply.findFirst({ where: { ticketId: t.id, fromCustomer: true, emailMessageId: { not: null } }, orderBy: { createdAt: 'desc' }, select: { emailMessageId: true } }),
          prisma.user.findUnique({ where: { id: me.id }, select: { fullName: true } }),
        ]);
        const signature = [agent?.fullName?.split(' ')[0], queue.signature || `${queue.name}, ${head.companyName}`].filter(Boolean).join('\n');
        const m = renderSupportReply({ ...head, queueName: queue.name, number: t.number, subject: t.subject, customerName: customer?.fullName ?? t.contactName, responseUrl: followUrl(t), body: text, by: 'agent', assistantName: PLATFORM.assistant, signature, statusLabel: SUPPORT_STATUS_FOR_CUSTOMER[status], colleague: Boolean(t.requesterUserId) });
        const refs = [t.sourceMessageId, lastIn?.emailMessageId].filter((x): x is string => Boolean(x));
        const sent = await sendFromSupport({ organisationId: t.organisationId, ticketId: t.id, mailboxId: t.mailboxId, to, subject: subjectFor(t.number, `Re: ${t.subject}`), html: m.html, inReplyTo: lastIn?.emailMessageId ?? t.sourceMessageId, references: refs, automatic: false });
        await prisma.supportReply.update({ where: { id: replyId }, data: { emailMessageId: sent.messageId } });
      } else {
        const [org, branch] = await Promise.all([
          prisma.organisation.findUnique({ where: { id: t.organisationId }, select: { name: true } }),
          t.branchId ? prisma.branch.findUnique({ where: { id: t.branchId }, select: { name: true } }) : null,
        ]);
        const site = websiteBaseUrl();
        const m = renderCustomerSupportReplyEmail({
          customerName: customer?.fullName ?? t.contactName,
          ticketNumber: t.number,
          subject: t.subject,
          reply: text,
          statusLabel: SUPPORT_STATUS_FOR_CUSTOMER[status],
          portalUrl: t.customerId && site ? `${site}/customer-portal/dashboard/support` : responseUrl(t.token),
          logoUrl: `${site || portalBaseUrl()}/images/logo/email-logo.png`,
          companyName: org?.name ?? PLATFORM.name,
          branchName: branch?.name ?? null,
        });
        await sendEmail(to, m.subject, m.html);
      }
      emailed = true;
    } catch (err) {
      logError('replyToSupportTicket.email', err, { ticket: t.number });
    }
  }
  // How Enyo's latest draft fared: sent nearly as written, edited, or not used (the Enyo replies page and its learning).
  await markDraftUse(t.id, text, Boolean(opts.aiDrafted));
  await writeAuditLog({
    userId: me.id, organisationId: t.organisationId, action: 'support.replied', entityType: 'SupportTicket', entityId: t.id,
    metadata: { number: t.number, from: t.status, to: status, emailed, length: text.length, aiDrafted: Boolean(opts.aiDrafted), ...(t.assignedToId ? {} : { assignedTo: me.id }) },
  });
  if (status === 'RESOLVED') await learnFromResolution({ ticketId: t.id, organisationId: t.organisationId, userId: me.id, replyId }).catch(() => 'skipped');
  return { emailed, emailTo: to };
}

async function markDraftUse(ticketId: string, sent: string, usedDraft: boolean): Promise<void> {
  try {
    const draft = await prisma.supportReply.findFirst({ where: { ticketId, kind: 'AI_DRAFT', reviewStatus: null }, orderBy: { createdAt: 'desc' }, select: { id: true, body: true } });
    if (!draft) return;
    await prisma.supportReply.updateMany({ where: { id: draft.id, reviewStatus: null }, data: { reviewStatus: draftUse(draft.body, sent, usedDraft), reviewedAt: new Date() } });
  } catch {
    /* a measure, never in the way of a reply */
  }
}

/** A note for colleagues only — never shown or sent to the customer. */
export async function addSupportNote(ticketId: string, body: string): Promise<void> {
  await authorize(PERM, undefined, 'addSupportNote');
  const me = await requireUser();
  const reach = (await fenceStaffHelp(ticketReachWhere(await reachWhere(PERM), await myOrganisationId()))) as Where;
  const t = await ticketForChange(ticketId, reach);
  const text = cleanReply(body);
  if (text.length < 2) throw new SupportError('Write the note first.');
  if (text.length > REPLY_MAX) throw new SupportError(`A note can be at most ${REPLY_MAX.toLocaleString('en-NG')} characters.`);
  await prisma.supportReply.create({ data: { ticketId: t.id, authorUserId: me.id, kind: 'NOTE', visibility: 'INTERNAL', body: text } });
  await prisma.supportTicket.update({ where: { id: t.id }, data: { updatedAt: new Date() } });
  await writeAuditLog({ userId: me.id, organisationId: t.organisationId, action: 'support.note_added', entityType: 'SupportTicket', entityId: t.id, metadata: { number: t.number, length: text.length } });
}

/** Open, waiting on the customer, on hold (waiting on others), resolved or closed. */
export async function setSupportTicketStatus(ticketId: string, status: string): Promise<void> {
  await authorize(PERM, undefined, 'setSupportTicketStatus');
  const me = await requireUser();
  const reach = (await fenceStaffHelp(ticketReachWhere(await reachWhere(PERM), await myOrganisationId()))) as Where;
  const t = await ticketForChange(ticketId, reach);
  if (!isSupportStatus(status)) throw new SupportError('Choose a status.');
  if (t.status === status) return;
  const now = new Date();
  claimed(await prisma.supportTicket.updateMany({
    where: { id: t.id, status: t.status },
    data: {
      status,
      resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? now : null,
      closedAt: status === 'CLOSED' ? now : null,
      pendingSince: status === 'WAITING_ON_CUSTOMER' ? now : null,
      ...((t.status === 'RESOLVED' || t.status === 'CLOSED') && (status === 'OPEN' || status === 'ON_HOLD') ? { reopenCount: { increment: 1 } } : {}),
    },
  }));
  await writeAuditLog({ userId: me.id, organisationId: t.organisationId, action: 'support.status_changed', entityType: 'SupportTicket', entityId: t.id, metadata: { number: t.number, from: t.status, to: status } });
  if (status === 'RESOLVED') await learnFromResolution({ ticketId: t.id, organisationId: t.organisationId, userId: me.id }).catch(() => 'skipped');
}

/** Give the ticket to oneself ("me"), to a colleague who may handle it, or to nobody (""). */
export async function assignSupportTicket(ticketId: string, assigneeId: string): Promise<void> {
  await authorize(PERM, undefined, 'assignSupportTicket');
  const me = await requireUser();
  const reach = (await fenceStaffHelp(ticketReachWhere(await reachWhere(PERM), await myOrganisationId()))) as Where;
  const t = await ticketForChange(ticketId, reach);
  const target = assigneeId === 'me' ? me.id : (assigneeId || null);
  if (target === t.assignedToId) return;
  let targetName: string | null = null;
  if (target) {
    const allowed = await colleaguesFor(t.organisationId, t.branchId);
    const hit = allowed.find((c) => c.id === target);
    // Oneself: the platform team may take a ticket even though they are not listed as a colleague.
    if (!hit && !(target === me.id && (await getPrincipal()).isSuperAdmin)) throw new SupportError('That person cannot handle this ticket. Choose a colleague from the list.');
    targetName = hit?.name ?? null;
  }
  claimed(await prisma.supportTicket.updateMany({ where: { id: t.id, assignedToId: t.assignedToId }, data: { assignedToId: target } }));
  await writeAuditLog({
    userId: me.id, organisationId: t.organisationId, action: 'support.assigned', entityType: 'SupportTicket', entityId: t.id,
    metadata: { number: t.number, from: t.assignedToId, to: target, ...(targetName ? { toName: targetName } : {}) },
  });
  // The colleague it was given to hears by email too (not when they took it themselves).
  if (target && target !== me.id) announceLater(t.id, me.id);
}

/** Urgent, high, normal or low. Before the first answer, the target moves with it. */
export async function setSupportPriority(ticketId: string, priority: string): Promise<void> {
  await authorize(PERM, undefined, 'setSupportPriority');
  const me = await requireUser();
  const reach = (await fenceStaffHelp(ticketReachWhere(await reachWhere(PERM), await myOrganisationId()))) as Where;
  const t = await ticketForChange(ticketId, reach);
  if (!(PRIORITIES as readonly string[]).includes(priority)) throw new SupportError('Choose a priority.');
  if (t.priority === priority) return;
  const p = priority as Priority;
  const queue = await queueById(t.organisationId, t.queueId);
  const s = await supportSettings(t.organisationId);
  const due = dueDates(t.createdAt, p, queue.targets, s.hours, s.holidays);
  claimed(await prisma.supportTicket.updateMany({
    where: { id: t.id, priority: t.priority },
    data: { priority: p, ...(t.firstResponseAt ? {} : { dueFirstResponseAt: due.first, slaWarnedAt: null, slaBreachedAt: null }), dueResolutionAt: due.resolve },
  }));
  await writeAuditLog({ userId: me.id, organisationId: t.organisationId, action: 'support.priority_changed', entityType: 'SupportTicket', entityId: t.id, metadata: { number: t.number, from: t.priority, to: p, label: PRIORITY_LABEL[p] } });
}

/** Moves the ticket to another team (queue); its targets follow that team's. */
export async function moveSupportTicket(ticketId: string, queueId: string): Promise<void> {
  await authorize(PERM, undefined, 'moveSupportTicket');
  const me = await requireUser();
  const reach = (await fenceStaffHelp(ticketReachWhere(await reachWhere(PERM), await myOrganisationId()))) as Where;
  const t = await ticketForChange(ticketId, reach);
  const target = await prisma.supportQueue.findFirst({ where: { id: String(queueId ?? ''), organisationId: t.organisationId, active: true }, select: { id: true, name: true } });
  if (!target) throw new SupportError('Choose a team from the list.');
  if (target.id === t.queueId) return;
  const queue = await queueById(t.organisationId, target.id);
  const s = await supportSettings(t.organisationId);
  const due = dueDates(t.createdAt, asPriority(t.priority), queue.targets, s.hours, s.holidays);
  claimed(await prisma.supportTicket.updateMany({
    where: { id: t.id, queueId: t.queueId },
    data: { queueId: target.id, ...(t.firstResponseAt ? {} : { dueFirstResponseAt: due.first, slaWarnedAt: null, slaBreachedAt: null }), dueResolutionAt: due.resolve },
  }));
  await writeAuditLog({ userId: me.id, organisationId: t.organisationId, action: 'support.queue_changed', entityType: 'SupportTicket', entityId: t.id, metadata: { number: t.number, from: t.queueId, to: target.id, queue: target.name } });
}

/** Enyo writes a reply for the colleague to check and send (nothing is sent). */
export async function draftSupportReply(ticketId: string): Promise<{ text: string } | { error: string }> {
  await authorize(PERM, undefined, 'draftSupportReply');
  await requireUser();
  const reach = (await fenceStaffHelp(ticketReachWhere(await reachWhere(PERM), await myOrganisationId()))) as Where;
  const t = await ticketForChange(ticketId, reach);
  const thread = await prisma.supportReply.findMany({ where: { ticketId: t.id, kind: { in: ['CUSTOMER', 'AGENT', 'AI'] } }, orderBy: { createdAt: 'asc' }, take: 30, select: { fromCustomer: true, body: true } });
  const lastCustomer = [...thread].reverse().find((r) => r.fromCustomer)?.body ?? t.subject;
  const context = thread.slice(-6).map((r) => `${r.fromCustomer ? 'Customer' : 'Us'}: ${r.body}`).join('\n\n');
  const sender = await senderContext(t, `${t.subject}\n${lastCustomer}`.slice(0, 600)).catch(() => null);
  const ai = await aiReply(t.organisationId, { customerName: t.contactName, subject: t.subject, body: `${lastCustomer}\n\nEarlier in this conversation:\n${context}`.slice(0, 6000), topic: t.topic, mode: 'draft', context: sender });
  if (!ai) return { error: 'Enyo could not write a reply just now. Please write it yourself or try again in a minute.' };
  return { text: ai.reply };
}

/** Enyo summarises the whole thread into the hand-over note. */
export async function summariseSupportTicket(ticketId: string): Promise<void> {
  await authorize(PERM, undefined, 'summariseSupportTicket');
  const me = await requireUser();
  const reach = (await fenceStaffHelp(ticketReachWhere(await reachWhere(PERM), await myOrganisationId()))) as Where;
  const t = await ticketForChange(ticketId, reach);
  const thread = await prisma.supportReply.findMany({ where: { ticketId: t.id, kind: { in: ['CUSTOMER', 'AGENT', 'AI', 'NOTE'] } }, orderBy: { createdAt: 'asc' }, take: 60, select: { fromCustomer: true, kind: true, body: true } });
  const text = thread.map((r) => `${r.fromCustomer ? 'Customer' : r.kind === 'NOTE' ? 'Colleague (internal note)' : 'Us'}: ${r.body}`).join('\n\n');
  const summary = await aiSummary(t.organisationId, t.subject, text);
  if (!summary) throw new SupportError('Enyo could not summarise this just now. Please try again in a minute.');
  await prisma.supportTicket.update({ where: { id: t.id }, data: { summary } });
  await writeAuditLog({ userId: me.id, organisationId: t.organisationId, action: 'support.summarised', entityType: 'SupportTicket', entityId: t.id, metadata: { number: t.number } });
}

/** "Save as an answer": the customer's question and this reply become a candidate for Enyo (approved on the Enyo learning page). */
export async function saveSupportAnswer(ticketId: string, replyId: string): Promise<'learned' | 'skipped'> {
  await authorize(PERM, undefined, 'saveSupportAnswer');
  const me = await requireUser();
  const reach = (await fenceStaffHelp(ticketReachWhere(await reachWhere(PERM), await myOrganisationId()))) as Where;
  const t = await ticketForChange(ticketId, reach);
  const r = await learnFromResolution({ ticketId: t.id, organisationId: t.organisationId, userId: me.id, replyId: String(replyId ?? '') });
  if (r === 'learned') await writeAuditLog({ userId: me.id, organisationId: t.organisationId, action: 'support.answer_saved', entityType: 'SupportTicket', entityId: t.id, metadata: { number: t.number } });
  return r;
}

/**
 * A ticket a colleague opens (a phone call, a walk-in, a WhatsApp message):
 * it gets a number, a team, targets and an owner like any other. The
 * customer is the organisation's (by id), or a name with a phone or email.
 */
export async function createSupportTicket(input: { customerId?: string; contactName?: string; contactPhone?: string; contactEmail?: string; subject?: string; body?: string; queueId?: string; priority?: string }): Promise<{ id: string; number: string }> {
  await authorize(PERM, undefined, 'createSupportTicket');
  const me = await requireUser();
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new SupportError('Your account is not placed in an organisation yet.');
  ticketReachWhere(await reachWhere(PERM), organisationId);
  const subject = String(input.subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const body = cleanReply(input.body);
  if (subject.length < 3) throw new SupportError('Say in a few words what it is about.');
  if (body.length < 3) throw new SupportError('Write what the customer said or needs.');
  if (body.length > REPLY_MAX) throw new SupportError(`At most ${REPLY_MAX.toLocaleString('en-NG')} characters.`);
  const typedEmail = String(input.contactEmail ?? '').trim().toLowerCase();
  const customer = input.customerId
    ? await prisma.customer.findFirst({ where: { id: String(input.customerId), organisationId }, select: { id: true, fullName: true, email: true, phone: true } })
    // A known customer's email links the request to their file.
    : typedEmail ? await prisma.customer.findFirst({ where: { organisationId, email: { equals: typedEmail, mode: 'insensitive' } }, select: { id: true, fullName: true, email: true, phone: true } }) : null;
  if (input.customerId && !customer) throw new SupportError('That customer is not available.');
  const name = customer?.fullName ?? String(input.contactName ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const email = customer?.email ?? (String(input.contactEmail ?? '').trim().toLowerCase().slice(0, 200) || null);
  const phone = customer?.phone ?? (String(input.contactPhone ?? '').replace(/[^\d+ ]/g, '').trim().slice(0, 30) || null);
  if (!name) throw new SupportError('Give the customer’s name.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SupportError('That email address does not look right.');
  if (!email && !phone) throw new SupportError('Give a phone number or an email address so the team can answer.');
  const queue = await queueById(organisationId, input.queueId ? String(input.queueId) : null);
  const priority = asPriority(input.priority);
  const p = await getPrincipal();
  const created = await openTicket({
    organisationId, channel: 'STAFF', queue, branchId: p.branchId ?? null, customerId: customer?.id ?? null, contactName: name, contactEmail: email, contactPhone: phone,
    // A colleague spoke to them, but identity is only "verified" when they picked the customer's own file.
    subject, summary: body.slice(0, 400), priority, entities: extractEntities(`${subject}\n${body}`), verified: Boolean(input.customerId && customer),
  });
  await prisma.supportReply.create({ data: { ticketId: created.id, fromCustomer: true, kind: 'CUSTOMER', visibility: 'PUBLIC', body } });
  await prisma.supportReply.create({ data: { ticketId: created.id, authorUserId: me.id, kind: 'NOTE', visibility: 'INTERNAL', body: `Opened by a colleague for ${name}${phone ? ` (${phone})` : ''}.` } });
  await supportEvent({ organisationId, ticketId: created.id, userId: me.id, action: 'support.ticket_opened', metadata: { actor: 'staff', number: created.number, channel: 'STAFF', queue: queue.name, priority } });
  announceLater(created.id);
  return { id: created.id, number: created.number };
}

/** Email the owner (or the leads) once the response has gone; outside a request, straight away. */
function announceLater(ticketId: string, by: string | null = null): void {
  const run = () => (by ? emailAssignee(ticketId, by) : announceRouted(ticketId)).then(() => undefined).catch(() => undefined);
  try { after(run); } catch { void run(); }
}
