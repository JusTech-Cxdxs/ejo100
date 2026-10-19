'use server';

import { randomBytes } from 'node:crypto';
import { headers } from 'next/headers';
import { prisma } from '@ejo/database';
import { siteOrganisation } from '@/lib/enyo/settings';
import { lagosYear, nextTicketNumber, retryOnNumberClash, ticketPrefix } from '@/lib/enyo/rules';
import { clientIp } from '@/lib/customer-audit';
import { logCustomerError } from '@/lib/error-events';
import { CONTACT_DAILY_LIMIT, TOPICS, checkContact } from './core';

/** What the visitor typed, echoed back with an error so the form keeps it (React resets a form after its action). */
export type ContactValues = { name: string; email: string; phone: string; company: string; message: string; topic: string };
export type ContactState = { ok: true; number: string; token: string | null } | { ok: false; error: string; field?: string; values: ContactValues } | null;

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');
const typed = (fd: FormData): ContactValues => ({ name: str(fd.get('name')), email: str(fd.get('email')), phone: str(fd.get('phone')), company: str(fd.get('company')), message: str(fd.get('message')), topic: str(fd.get('topic')) });

/**
 * The contact form: one support request in the organisation's Support
 * centre (channel WEBSITE, tagged by topic), given a queue, targets and an
 * owner by the centre's next run and acknowledged from there. The visitor
 * gets a reference and a page to follow it. Never linked to a customer by a
 * typed email (anyone can type anyone's address). At most five a day per address.
 */
export async function sendContactMessage(_prev: ContactState, fd: FormData): Promise<ContactState> {
  const checked = checkContact({ name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone'), topic: fd.get('topic'), company: fd.get('company'), message: fd.get('message'), website: fd.get('website') });
  const values = typed(fd);
  if (!checked.ok) return checked.message === 'Thank you.' ? { ok: true, number: 'received', token: null } : { ok: false, error: checked.message, field: checked.field, values };
  const v = checked.value;
  let ip: string | null = null;
  try { ip = clientIp(await headers()); } catch { ip = null; }
  const org = await siteOrganisation().catch(() => null);
  if (!org) return { ok: false, error: 'The contact form is not switched on yet. Please call or email us instead.', values };
  // At most five a day from one address (counted from the record, so it holds across servers and restarts).
  if (ip) {
    const sent = await prisma.auditLog.count({ where: { organisationId: org.id, action: 'support.ticket_opened', ipAddress: ip, createdAt: { gte: new Date(Date.now() - 86_400_000) } } }).catch(() => 0);
    if (sent >= CONTACT_DAILY_LIMIT) return { ok: false, error: 'You have sent several messages today. Our team will answer those first — or call us if it is urgent.', values };
  }
  const kind = TOPICS[v.topic]!;
  const subject = `${kind.label}${v.company ? ` — ${v.company}` : ''}`.slice(0, 140);
  try {
    const ticket = await retryOnNumberClash('number', async () => {
      const year = lagosYear();
      const latest = await prisma.supportTicket.findFirst({ where: { number: { startsWith: ticketPrefix(year) } }, orderBy: { number: 'desc' }, select: { number: true } });
      return prisma.$transaction(async (tx) => {
        const t = await tx.supportTicket.create({
          data: {
            id: `sup${randomBytes(11).toString('hex')}`, organisationId: org.id, number: nextTicketNumber(latest?.number, year),
            channel: 'WEBSITE', contactName: v.name, contactEmail: v.email, contactPhone: v.phone,
            subject, summary: `Website contact form — ${kind.label}: ${v.message.slice(0, 560)}`, priority: kind.priority, token: randomBytes(24).toString('base64url'),
            handoverReason: v.topic === 'complaint' ? 'complaint' : 'customer_asked', lastCustomerAt: new Date(), tags: ['website_contact', ...kind.tags],
          },
          select: { id: true, number: true, token: true },
        });
        await tx.supportReply.create({ data: { ticketId: t.id, fromCustomer: true, kind: 'CUSTOMER', visibility: 'PUBLIC', body: v.message } });
        return t;
      });
    });
    await prisma.auditLog.create({ data: { organisationId: org.id, userId: null, action: 'support.ticket_opened', entityType: 'SupportTicket', entityId: ticket.id, metadata: { actor: 'visitor', number: ticket.number, channel: 'WEBSITE', topic: v.topic }, ipAddress: ip } }).catch(() => undefined);
    return { ok: true, number: ticket.number, token: ticket.token };
  } catch (err) {
    const ref = await logCustomerError('sendContactMessage', err);
    return { ok: false, error: `We couldn’t send your message just now. Please try again, or call us and quote reference ${ref}.`, values };
  }
}
