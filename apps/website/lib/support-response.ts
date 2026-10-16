'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@ejo/database';
import { clientIp } from '@/lib/customer-audit';
import { logCustomerError } from '@/lib/error-events';

/**
 * The customer's answers on their own request page (linked from support
 * emails): "Yes, this solved it", "I still need a person", and "How did we
 * do?" (1–5 with an optional comment). The unguessable link IS the
 * permission (like an unsubscribe link); nothing changes on opening it —
 * only when the person presses a button (so email scanners that follow
 * links change nothing). Each answer writes the audit trail (no text).
 */

const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;
export type ResponseState = { ok: boolean; message: string } | null;

const hits = new Map<string, number[]>();
function tooMany(key: string): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  if (hits.size > 5000) hits.clear();
  hits.set(key, list);
  return list.length > 10;
}

async function audit(organisationId: string, ticketId: string, action: string, metadata: Record<string, unknown>) {
  let ip: string | null = null;
  try { ip = clientIp(await headers()); } catch { ip = null; }
  await prisma.auditLog.create({ data: { organisationId, userId: null, action, entityType: 'SupportTicket', entityId: ticketId, metadata: { actor: 'customer', ...metadata }, ipAddress: ip } }).catch(() => undefined);
}

export async function respondToRequest(_prev: ResponseState, f: FormData): Promise<ResponseState> {
  const token = String(f.get('token') ?? '');
  const what = String(f.get('what') ?? '');
  if (!TOKEN.test(token)) return { ok: false, message: 'This link is not valid. Please reply to the email instead.' };
  if (tooMany(token)) return { ok: false, message: 'Please wait a moment, then try again.' };
  try {
    const t = await prisma.supportTicket.findUnique({ where: { token }, select: { id: true, organisationId: true, number: true, status: true, aiOutcome: true, handoverReason: true } });
    if (!t) return { ok: false, message: 'We could not find this request. Please reply to the email instead.' };
    const path = `/support/request/${token}`;
    if (what === 'solved') {
      if (t.status === 'RESOLVED' || t.status === 'CLOSED') return { ok: true, message: 'Thank you — this request is already marked as solved.' };
      const done = await prisma.supportTicket.updateMany({ where: { id: t.id, status: t.status }, data: { status: 'RESOLVED', resolvedAt: new Date(), pendingSince: null, ...(t.aiOutcome === 'ANSWERED' || t.aiOutcome === 'ASSUMED' ? { aiOutcome: 'CONFIRMED' } : {}) } });
      if (!done.count) return { ok: false, message: 'This request changed just now. Please refresh the page and try again.' };
      await prisma.supportReply.create({ data: { ticketId: t.id, kind: 'SYSTEM', visibility: 'PUBLIC', body: 'The customer said this solved it.' } });
      await audit(t.organisationId, t.id, 'support.customer_confirmed', { number: t.number });
      revalidatePath(path);
      return { ok: true, message: 'Thank you! We have marked your request as solved. If anything else comes up, just reply to the email.' };
    }
    if (what === 'person') {
      if (t.status === 'CLOSED') return { ok: false, message: 'This request is closed. Please reply to the email or write to us again, and a colleague will pick it up as a new request.' };
      const reasons = [...new Set([...(t.handoverReason ? t.handoverReason.split(',') : []), 'customer_asked'])].join(',');
      const done = await prisma.supportTicket.updateMany({
        where: { id: t.id, status: t.status },
        data: {
          status: t.status === 'ON_HOLD' ? 'ON_HOLD' : 'OPEN', resolvedAt: null, pendingSince: null, lastCustomerAt: new Date(), handoverReason: reasons,
          ...(t.status === 'RESOLVED' ? { reopenCount: { increment: 1 } } : {}),
          ...(t.aiOutcome ? { aiOutcome: 'ESCALATED' } : {}),
        },
      });
      if (!done.count) return { ok: false, message: 'This request changed just now. Please refresh the page and try again.' };
      await prisma.supportReply.create({ data: { ticketId: t.id, kind: 'SYSTEM', visibility: 'PUBLIC', body: 'The customer asked to talk to a person.' } });
      await audit(t.organisationId, t.id, 'support.customer_asked_person', { number: t.number });
      revalidatePath(path);
      return { ok: true, message: 'Done — a colleague will get back to you. To add details, simply reply to the email.' };
    }
    if (what === 'rate') {
      const score = Number(f.get('score'));
      if (!Number.isInteger(score) || score < 1 || score > 5) return { ok: false, message: 'Choose a score from 1 to 5.' };
      if (t.status !== 'RESOLVED' && t.status !== 'CLOSED') return { ok: false, message: 'You can rate us once your request is resolved.' };
      const comment = String(f.get('comment') ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 1000) || null;
      await prisma.supportTicket.update({ where: { id: t.id }, data: { csatScore: score, csatComment: comment, csatAt: new Date() } });
      await audit(t.organisationId, t.id, 'support.customer_rated', { number: t.number, score, commented: Boolean(comment) });
      revalidatePath(path);
      return { ok: true, message: score >= 4 ? 'Thank you for letting us know!' : 'Thank you for telling us. We read every rating and will use it to do better.' };
    }
    return { ok: false, message: 'Choose an option.' };
  } catch (err) {
    const ref = await logCustomerError('support.respond', err);
    return { ok: false, message: `That did not work just now. Please try again, or reply to the email (reference ${ref}).` };
  }
}
