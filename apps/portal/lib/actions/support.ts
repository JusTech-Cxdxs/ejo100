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
import {
  cleanReply, filterWhere, isSupportStatus, REPLY_MAX, SUPPORT_STATUS_FOR_CUSTOMER, SUPPORT_STATUS_LABEL, supportFilter, ticketReachWhere, waitLabel,
  type SupportFilter, type SupportStatus,
} from '@/lib/support-rules';

/**
 * The support inbox: customers and website visitors handed over by Enyo.
 * Every action needs support.tickets.manage and works only on tickets of the
 * person's organisation within their branch reach (website enquiries without
 * a branch are the whole organisation's). Replies are emailed to the customer
 * in the branded layout and show in their customer portal. Every change is in
 * the audit trail (support.replied / support.status_changed / support.assigned)
 * without the message text.
 */

class SupportError extends Error {}

const PERM: PermissionKey = 'support.tickets.manage';

type Where = Prisma.SupportTicketWhereInput;

export type SupportInboxRow = {
  id: string; number: string; status: SupportStatus; statusLabel: string; channel: 'CUSTOMER_PORTAL' | 'WEBSITE';
  contactName: string; customerId: string | null; subject: string; createdAt: Date; updatedAt: Date;
  assignedTo: string | null; mine: boolean; branchName: string | null; firstResponse: string | null; lastFromCustomer: boolean;
};

export type SupportInbox = {
  filter: SupportFilter;
  rows: SupportInboxRow[];
  counts: Record<'open' | 'waiting' | 'resolved' | 'mine', number>;
  canCrm: boolean;
};

export async function getSupportInbox(input: { filter?: string; q?: string } = {}): Promise<SupportInbox> {
  await authorize(PERM, undefined, 'getSupportInbox');
  const me = await requireUser();
  const reach = ticketReachWhere(await reachWhere(PERM), await myOrganisationId()) as Where;
  const filter = supportFilter(input.filter);
  const q = typeof input.q === 'string' ? input.q.trim().slice(0, 60) : '';
  const search: Where = q
    ? { OR: [{ number: { contains: q, mode: 'insensitive' } }, { contactName: { contains: q, mode: 'insensitive' } }, { subject: { contains: q, mode: 'insensitive' } }, { contactPhone: { contains: q } }, { contactEmail: { contains: q, mode: 'insensitive' } }] }
    : {};
  const [rows, open, waiting, resolved, mine, canCrm] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { AND: [reach, filterWhere(filter, me.id) as Where, search] },
      orderBy: filter === 'resolved' ? { updatedAt: 'desc' } : { createdAt: 'asc' },
      take: 100,
      select: {
        id: true, number: true, status: true, channel: true, contactName: true, customerId: true, subject: true, createdAt: true, updatedAt: true,
        assignedToId: true, branchId: true, firstResponseAt: true,
        replies: { orderBy: { createdAt: 'desc' }, take: 1, select: { fromCustomer: true } },
      },
    }),
    prisma.supportTicket.count({ where: { AND: [reach, filterWhere('open', me.id) as Where] } }),
    prisma.supportTicket.count({ where: { AND: [reach, filterWhere('waiting', me.id) as Where] } }),
    prisma.supportTicket.count({ where: { AND: [reach, filterWhere('resolved', me.id) as Where] } }),
    prisma.supportTicket.count({ where: { AND: [reach, filterWhere('mine', me.id) as Where] } }),
    allows('crm.view'),
  ]);
  const userIds = [...new Set(rows.map((r) => r.assignedToId).filter((x): x is string => Boolean(x)))];
  const branchIds = [...new Set(rows.map((r) => r.branchId).filter((x): x is string => Boolean(x)))];
  const [users, branches] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : [],
    branchIds.length ? prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } }) : [],
  ]);
  const name = new Map(users.map((u) => [u.id, u.fullName]));
  const bname = new Map(branches.map((b) => [b.id, b.name]));
  return {
    filter,
    canCrm,
    counts: { open, waiting, resolved, mine },
    rows: rows.map((r) => ({
      id: r.id, number: r.number, status: r.status as SupportStatus, statusLabel: SUPPORT_STATUS_LABEL[r.status as SupportStatus] ?? r.status,
      channel: r.channel, contactName: r.contactName, customerId: r.customerId, subject: r.subject, createdAt: r.createdAt, updatedAt: r.updatedAt,
      assignedTo: r.assignedToId ? name.get(r.assignedToId) ?? 'A colleague' : null, mine: r.assignedToId === me.id,
      branchName: r.branchId ? bname.get(r.branchId) ?? null : null,
      firstResponse: r.firstResponseAt ? waitLabel(r.createdAt, r.firstResponseAt) : null,
      lastFromCustomer: r.replies[0]?.fromCustomer ?? true,
    })),
  };
}

/** Open (unassigned or mine) tickets waiting on the team — for the menu count. */
export async function countOpenSupportTickets(): Promise<number> {
  const user = await requireUser();
  if (!(await allows(PERM))) return 0;
  const reach = ticketReachWhere(await reachWhere(PERM), await myOrganisationId()) as Where;
  return prisma.supportTicket.count({ where: { AND: [reach, { status: 'OPEN' }, { OR: [{ assignedToId: null }, { assignedToId: user.id }] }] } }).catch(() => 0);
}

export type SupportTicketDetail = {
  id: string; number: string; status: SupportStatus; statusLabel: string; channel: 'CUSTOMER_PORTAL' | 'WEBSITE';
  contactName: string; contactPhone: string | null; contactEmail: string | null; customerId: string | null; customerName: string | null; canCrm: boolean;
  subject: string; summary: string; createdAt: Date; firstResponseAt: Date | null; firstResponse: string | null; resolvedAt: Date | null;
  branchName: string | null; assignedToId: string | null; assignedTo: string | null; mine: boolean;
  replies: { id: string; fromCustomer: boolean; author: string; body: string; createdAt: Date }[];
  transcript: { id: string; role: 'customer' | 'enyo'; text: string; at: Date }[];
  colleagues: { id: string; name: string }[];
  emailTo: string | null;
};

/** One ticket with its replies, Enyo's summary and the conversation (read-only) — or "not available". */
export async function getSupportTicket(ticketId: string): Promise<SupportTicketDetail> {
  await authorize(PERM, undefined, 'getSupportTicket');
  const me = await requireUser();
  const reach = ticketReachWhere(await reachWhere(PERM), await myOrganisationId()) as Where;
  const t = typeof ticketId === 'string' && ticketId ? await prisma.supportTicket.findFirst({
    where: { AND: [{ id: ticketId }, reach] },
    include: { replies: { orderBy: { createdAt: 'asc' }, take: 300 } },
  }) : null;
  if (!t) throw new SupportError(NOT_AVAILABLE);
  const authorIds = [...new Set([t.assignedToId, ...t.replies.map((r) => r.authorUserId)].filter((x): x is string => Boolean(x)))];
  const [authors, customer, branch, transcript, colleagues, canCrm] = await Promise.all([
    authorIds.length ? prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, fullName: true } }) : [],
    t.customerId ? prisma.customer.findFirst({ where: { id: t.customerId, organisationId: t.organisationId }, select: { id: true, fullName: true, email: true } }) : null,
    t.branchId ? prisma.branch.findUnique({ where: { id: t.branchId }, select: { name: true } }) : null,
    t.conversationId ? prisma.enyoMessage.findMany({
      where: { conversationId: t.conversationId, conversation: { organisationId: t.organisationId }, role: { in: ['USER', 'ASSISTANT'] } },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: { id: true, role: true, content: true, createdAt: true },
    }) : [],
    colleaguesFor(t.organisationId, t.branchId),
    allows('crm.view'),
  ]);
  const who = new Map(authors.map((u) => [u.id, u.fullName]));
  return {
    id: t.id, number: t.number, status: t.status as SupportStatus, statusLabel: SUPPORT_STATUS_LABEL[t.status as SupportStatus] ?? t.status, channel: t.channel,
    contactName: t.contactName, contactPhone: t.contactPhone, contactEmail: t.contactEmail,
    customerId: customer?.id ?? null, customerName: customer?.fullName ?? null, canCrm,
    subject: t.subject, summary: t.summary, createdAt: t.createdAt, firstResponseAt: t.firstResponseAt,
    firstResponse: t.firstResponseAt ? waitLabel(t.createdAt, t.firstResponseAt) : null, resolvedAt: t.resolvedAt,
    branchName: branch?.name ?? null, assignedToId: t.assignedToId, assignedTo: t.assignedToId ? who.get(t.assignedToId) ?? 'A colleague' : null, mine: t.assignedToId === me.id,
    replies: t.replies.map((r) => ({ id: r.id, fromCustomer: r.fromCustomer, author: r.fromCustomer ? t.contactName : (r.authorUserId ? who.get(r.authorUserId) : null) ?? 'Customer care', body: r.body, createdAt: r.createdAt })),
    transcript: transcript.filter((m) => m.content.trim()).map((m) => ({ id: m.id, role: m.role === 'USER' ? 'customer' : 'enyo', text: m.content, at: m.createdAt })),
    colleagues,
    emailTo: customer?.email ?? t.contactEmail ?? null,
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
    select: { id: true, number: true, status: true, organisationId: true, branchId: true, customerId: true, contactName: true, contactEmail: true, subject: true, assignedToId: true, firstResponseAt: true, channel: true },
  }) : null;
  if (!t) throw new SupportError(NOT_AVAILABLE);
  return t;
}

/**
 * Answer the customer: the reply is kept on the ticket (it shows in their
 * customer portal), emailed to them in the branded layout, and the ticket
 * moves to `then` (default: waiting on the customer). The first answer sets
 * the first-response time; an unassigned ticket becomes the replier's.
 */
export async function replyToSupportTicket(ticketId: string, body: string, then: string = 'WAITING_ON_CUSTOMER'): Promise<{ emailed: boolean; emailTo: string | null }> {
  await authorize(PERM, undefined, 'replyToSupportTicket');
  const me = await requireUser();
  const reach = ticketReachWhere(await reachWhere(PERM), await myOrganisationId()) as Where;
  const t = await ticketForChange(ticketId, reach);
  const text = cleanReply(body);
  if (text.length < 2) throw new SupportError('Write the reply first.');
  if (text.length > REPLY_MAX) throw new SupportError(`A reply can be at most ${REPLY_MAX.toLocaleString('en-NG')} characters.`);
  const status: SupportStatus = isSupportStatus(then) ? then : 'WAITING_ON_CUSTOMER';
  const now = new Date();
  // Compare-and-set on the status read above: a customer reply or a colleague's change in between → "refresh and try again".
  await prisma.$transaction(async (tx) => {
    claimed(await tx.supportTicket.updateMany({
      where: { id: t.id, status: t.status },
      data: {
        status,
        firstResponseAt: t.firstResponseAt ?? now,
        resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? now : null,
        ...(t.assignedToId ? {} : { assignedToId: me.id }),
      },
    }));
    await tx.supportReply.create({ data: { ticketId: t.id, authorUserId: me.id, fromCustomer: false, body: text }, select: { id: true } });
  });

  // The customer's email: a portal customer's own address (read inside the organisation), else what the visitor gave.
  const customer = t.customerId ? await prisma.customer.findFirst({ where: { id: t.customerId, organisationId: t.organisationId }, select: { fullName: true, email: true } }) : null;
  const to = customer?.email ?? t.contactEmail ?? null;
  let emailed = false;
  if (to) {
    try {
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
        portalUrl: t.customerId && site ? `${site}/customer-portal/dashboard/support` : null,
        logoUrl: `${site || portalBaseUrl()}/images/logo/email-logo.png`,
        companyName: org?.name ?? 'EJO 100',
        branchName: branch?.name ?? null,
      });
      await sendEmail(to, m.subject, m.html);
      emailed = true;
    } catch (err) {
      logError('replyToSupportTicket.email', err, { ticket: t.number });
    }
  }
  await writeAuditLog({
    userId: me.id, organisationId: t.organisationId, action: 'support.replied', entityType: 'SupportTicket', entityId: t.id,
    metadata: { number: t.number, from: t.status, to: status, emailed, length: text.length, ...(t.assignedToId ? {} : { assignedTo: me.id }) },
  });
  return { emailed, emailTo: to };
}

/** Open, waiting on the customer, resolved or closed. */
export async function setSupportTicketStatus(ticketId: string, status: string): Promise<void> {
  await authorize(PERM, undefined, 'setSupportTicketStatus');
  const me = await requireUser();
  const reach = ticketReachWhere(await reachWhere(PERM), await myOrganisationId()) as Where;
  const t = await ticketForChange(ticketId, reach);
  if (!isSupportStatus(status)) throw new SupportError('Choose a status.');
  if (t.status === status) return;
  const now = new Date();
  claimed(await prisma.supportTicket.updateMany({ where: { id: t.id, status: t.status }, data: { status, resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? now : null } }));
  await writeAuditLog({ userId: me.id, organisationId: t.organisationId, action: 'support.status_changed', entityType: 'SupportTicket', entityId: t.id, metadata: { number: t.number, from: t.status, to: status } });
}

/** Give the ticket to oneself ("me"), to a colleague who may handle it, or to nobody (""). */
export async function assignSupportTicket(ticketId: string, assigneeId: string): Promise<void> {
  await authorize(PERM, undefined, 'assignSupportTicket');
  const me = await requireUser();
  const reach = ticketReachWhere(await reachWhere(PERM), await myOrganisationId()) as Where;
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
}
