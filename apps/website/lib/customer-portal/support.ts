'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { prisma } from '@ejo/database';
import { clientIp } from '@/lib/customer-audit';
import { logCustomerError } from '@/lib/error-events';
import { sendEmail, websiteBaseUrl } from '@/lib/email';
import { portalBaseUrl } from '@/lib/site-urls';
import { siteConfig } from '@/lib/site-config';
import { renderSupportCustomerReplyEmail } from '@/lib/email-templates/support';
import { currentCustomer } from './session';
import type { ActionState } from './actions';

/**
 * The customer's answer on one of their own support requests (Help &
 * support). Re-resolves the signed-in, active customer; touches only a
 * ticket that is theirs (id AND customerId AND organisation); sets it back to
 * OPEN so the team sees it; tells the person handling it (or the front desk)
 * by email; writes the audit trail without the message text.
 */

const REPLY_MAX = 2000;
const SIGNED_OUT: ActionState = { ok: false, error: 'Your session has ended. Please sign in again.' };

export async function replyToSupportTicket(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await currentCustomer();
  if (!me) return SIGNED_OUT;
  const ticketId = String(fd.get('ticketId') ?? '').slice(0, 64);
  const body = String(fd.get('body') ?? '').slice(0, REPLY_MAX + 500).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!body) return { ok: false, error: 'Please write your reply first.', fieldErrors: { body: 'Write your reply.' } };
  if (body.length > REPLY_MAX) return { ok: false, error: `Please keep your reply under ${REPLY_MAX.toLocaleString('en-NG')} characters.`, fieldErrors: { body: 'Too long.' } };
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(ticketId)) return { ok: false, error: 'That request isn’t on your account. Refresh the page and try again.' };

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, customerId: me.id, organisationId: me.organisationId },
    select: { id: true, number: true, status: true, assignedToId: true, branchId: true, organisationId: true, aiOutcome: true, handoverReason: true },
  });
  if (!ticket) return { ok: false, error: 'That request isn’t on your account. Refresh the page and try again.' };
  if (ticket.status === 'CLOSED') return { ok: false, error: 'This request is closed. Ask the assistant or call your branch, and we will open a new one.' };

  const recent = await prisma.supportReply.count({ where: { ticketId: ticket.id, fromCustomer: true, createdAt: { gte: new Date(Date.now() - 60_000) } } });
  if (recent >= 5) return { ok: false, error: 'You have sent several replies in a minute. Please wait a moment, then try again.' };

  try {
    await prisma.$transaction([
      prisma.supportReply.create({ data: { ticketId: ticket.id, fromCustomer: true, kind: 'CUSTOMER', visibility: 'PUBLIC', body }, select: { id: true } }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: ticket.status === 'ON_HOLD' ? 'ON_HOLD' : 'OPEN', resolvedAt: null, lastCustomerAt: new Date(), pendingSince: null, nudgeCount: 0,
          ...(ticket.status === 'RESOLVED' ? { reopenCount: { increment: 1 } } : {}),
          // Enyo answered and the customer came back: not resolved by Enyo after all.
          ...(ticket.aiOutcome === 'ANSWERED' ? { aiOutcome: 'ESCALATED', handoverReason: [ticket.handoverReason, 'repeat_contact'].filter(Boolean).join(',') } : {}),
        },
        select: { id: true },
      }),
    ]);
  } catch (err) {
    const ref = await logCustomerError('replyToSupportTicket', err);
    return { ok: false, error: `We couldn’t send your reply just now. Please try again. If it keeps happening, call your branch and quote reference ${ref}.` };
  }

  let ip: string | null = null;
  try { ip = clientIp(await headers()); } catch { ip = null; }
  await prisma.auditLog.create({
    data: {
      organisationId: me.organisationId, userId: null, action: 'support.customer_replied', entityType: 'SupportTicket', entityId: ticket.id,
      metadata: { actor: 'customer', customerId: me.id, number: ticket.number, reopened: ticket.status === 'RESOLVED' }, ipAddress: ip,
    },
  }).catch(() => undefined);

  const work = notifyTeam(ticket, me.fullName, body).catch((err) => logCustomerError('replyToSupportTicket.email', err));
  try { after(work); } catch { void work; }

  revalidatePath('/customer-portal/dashboard/support');
  return { ok: true, message: 'Your reply is sent. Our team will get back to you.', at: Date.now() };
}

async function notifyTeam(ticket: { id: string; number: string; assignedToId: string | null; branchId: string | null; organisationId: string }, contactName: string, body: string): Promise<void> {
  const [assignee, branch, org] = await Promise.all([
    ticket.assignedToId ? prisma.user.findFirst({ where: { id: ticket.assignedToId, organisationId: ticket.organisationId, isActive: true }, select: { fullName: true, email: true } }) : null,
    ticket.branchId ? prisma.branch.findUnique({ where: { id: ticket.branchId }, select: { email: true } }) : null,
    prisma.organisation.findUnique({ where: { id: ticket.organisationId }, select: { name: true, email: true } }),
  ]);
  const to = assignee?.email || branch?.email || org?.email || siteConfig.contact.email;
  if (!to) return;
  const m = renderSupportCustomerReplyEmail({
    companyName: org?.name || siteConfig.organisationName,
    logoUrl: `${websiteBaseUrl()}/images/logo/email-logo.png`,
    recipientName: assignee?.fullName ?? null,
    ticketNumber: ticket.number,
    contactName,
    body,
    url: `${portalBaseUrl()}/crm/support/${ticket.id}`,
  });
  await sendEmail(to, m.subject, m.html);
}
