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
import { renderSupportCustomerReplyEmail, renderSupportTicketConfirmEmail, renderSupportTicketStaffEmail } from '@/lib/email-templates/support';
import { randomBytes } from 'node:crypto';
import { lagosYear, nextTicketNumber, retryOnNumberClash, ticketPrefix } from '@/lib/enyo/rules';
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

  // Their own request, or one they left on the website with their account's email (replying signed in files it on their account).
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, organisationId: me.organisationId, OR: [{ customerId: me.id }, { customerId: null, channel: 'WEBSITE', contactEmail: { equals: me.email, mode: 'insensitive' } }] },
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
          customerId: me.id,
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

// ─────────────────────────────────────────────── a new request from the portal

/** What a customer's request is about: decides the team (complaints → Customer care, warranty → Warranty). */
const ABOUT: Record<string, { label: string; tags: string[]; priority: 'NORMAL' | 'HIGH' }> = {
  question: { label: 'A question', tags: [], priority: 'NORMAL' },
  vehicle: { label: 'My vehicle or a job', tags: ['topic:vehicle'], priority: 'NORMAL' },
  payment: { label: 'A payment or an estimate', tags: ['topic:payment'], priority: 'NORMAL' },
  warranty: { label: 'A warranty', tags: ['topic:warranty'], priority: 'NORMAL' },
  complaint: { label: 'A complaint', tags: ['complaint'], priority: 'HIGH' },
};
const SUBJECT_MAX = 140;

/**
 * The signed-in customer opens a support request themselves (Help & support):
 * a SUP-numbered ticket on their own account (channel CUSTOMER_PORTAL), their
 * message as its first reply, sent to the right team by the Support centre's
 * next run (within minutes), with a confirmation email and the branch told.
 * At most 5 new requests a day per customer.
 */
export async function openSupportRequest(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await currentCustomer();
  if (!me) return SIGNED_OUT;
  const about = ABOUT[String(fd.get('about') ?? '')] ? String(fd.get('about')) : '';
  const subject = String(fd.get('subject') ?? '').replace(/\s+/g, ' ').trim().slice(0, SUBJECT_MAX + 20);
  const body = String(fd.get('body') ?? '').slice(0, REPLY_MAX + 500).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const fieldErrors: Record<string, string> = {};
  if (!about) fieldErrors.about = 'Choose what it is about.';
  if (subject.length < 3) fieldErrors.subject = 'Say in a few words what it is about.';
  if (subject.length > SUBJECT_MAX) fieldErrors.subject = `At most ${SUBJECT_MAX} characters.`;
  if (body.length < 10) fieldErrors.body = 'Tell us a little more (at least a sentence).';
  if (body.length > REPLY_MAX) fieldErrors.body = `Please keep it under ${REPLY_MAX.toLocaleString('en-NG')} characters.`;
  if (Object.keys(fieldErrors).length) return { ok: false, error: 'Please check the highlighted fields.', fieldErrors };

  const today = await prisma.supportTicket.count({ where: { customerId: me.id, organisationId: me.organisationId, tags: { has: 'portal_request' }, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
  if (today >= 5) return { ok: false, error: 'You have opened 5 requests today. Our team will answer those first — or call your branch if it is urgent.' };

  const kind = ABOUT[about]!;
  let ticket: { id: string; number: string; token: string | null };
  try {
    const branch = await prisma.jobCard.findFirst({ where: { customerId: me.id }, orderBy: { createdAt: 'desc' }, select: { branchId: true } });
    ticket = await retryOnNumberClash('number', async () => {
      const year = lagosYear();
      const latest = await prisma.supportTicket.findFirst({ where: { number: { startsWith: ticketPrefix(year) } }, orderBy: { number: 'desc' }, select: { number: true } });
      return prisma.$transaction(async (tx) => {
        const t = await tx.supportTicket.create({
          data: {
            id: `sup${randomBytes(11).toString('hex')}`, organisationId: me.organisationId, branchId: branch?.branchId ?? null, number: nextTicketNumber(latest?.number, year),
            channel: 'CUSTOMER_PORTAL', customerId: me.id, contactName: me.fullName, contactEmail: me.email, contactPhone: me.phone ?? null,
            subject, summary: `${kind.label}: ${body.slice(0, 560)}`, priority: kind.priority, token: randomBytes(24).toString('base64url'),
            handoverReason: about === 'complaint' ? 'complaint' : 'customer_asked', lastCustomerAt: new Date(), tags: ['portal_request', ...kind.tags],
          },
          select: { id: true, number: true, token: true },
        });
        await tx.supportReply.create({ data: { ticketId: t.id, fromCustomer: true, kind: 'CUSTOMER', visibility: 'PUBLIC', body } });
        return t;
      });
    });
  } catch (err) {
    const ref = await logCustomerError('openSupportRequest', err);
    return { ok: false, error: `We couldn’t send your request just now. Please try again, or call your branch and quote reference ${ref}.` };
  }

  let ip: string | null = null;
  try { ip = clientIp(await headers()); } catch { ip = null; }
  await prisma.auditLog.create({
    data: { organisationId: me.organisationId, userId: null, action: 'support.ticket_opened', entityType: 'SupportTicket', entityId: ticket.id, metadata: { actor: 'customer', customerId: me.id, number: ticket.number, channel: 'CUSTOMER_PORTAL', about }, ipAddress: ip },
  }).catch(() => undefined);

  const work = (async () => {
    const org = await prisma.organisation.findUnique({ where: { id: me.organisationId }, select: { name: true, email: true } });
    const companyName = org?.name || siteConfig.organisationName;
    const logoUrl = `${websiteBaseUrl()}/images/logo/email-logo.png`;
    if (me.email) {
      const c = renderSupportTicketConfirmEmail({ companyName, logoUrl, fullName: me.fullName, ticketNumber: ticket.number, subject, url: `${websiteBaseUrl()}/customer-portal/dashboard/support` });
      await sendEmail(me.email, c.subject, c.html);
    }
    const staffTo = (org?.email || siteConfig.contact.email || '').trim();
    if (staffTo) {
      const m = renderSupportTicketStaffEmail({ companyName, logoUrl, ticketNumber: ticket.number, channelLabel: 'Customer portal', branchName: null, contactName: me.fullName, contactPhone: me.phone ?? null, contactEmail: me.email, subject: `${kind.label}: ${subject}`, summary: body.slice(0, 1200), url: `${portalBaseUrl()}/crm/support/${ticket.id}` });
      await sendEmail(staffTo, m.subject, m.html);
    }
  })().catch((err) => logCustomerError('openSupportRequest.email', err));
  try { after(work); } catch { void work; }

  revalidatePath('/customer-portal/dashboard/support');
  return { ok: true, message: `Thank you — your request is ${ticket.number}. Our team will reply here and by email.`, at: Date.now() };
}
