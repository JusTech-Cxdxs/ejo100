import 'server-only';
/**
 * Taking in email to the support addresses (support@, warranty@, technical@ …).
 *
 * On a schedule, each support mailbox is read (read-only: nothing is moved,
 * deleted or marked on the server) from where the last run stopped. Each
 * email is taken in exactly once (intakeKey = mailbox + Message-ID):
 *
 *  1. Mail-loop protection: bounces and our own mail are dropped; robots,
 *     lists and auto-replies are kept but never answered automatically; a
 *     sender writing more than 20 times an hour gets no automatic replies.
 *  2. Threading: the [#SUP-…] tag or the Message-IDs it answers find the
 *     ticket — but only when the sender is that ticket's customer, so a
 *     copied reference can never put one customer's mail on another's ticket.
 *     A reply to a closed ticket opens a follow-up.
 *  3. A new ticket: the customer is recognised by email address (verified
 *     when the sender's domain passed DMARC), plates / VINs / record numbers
 *     are picked out, the target times are set in business hours, the
 *     least-busy colleague of the queue gets it, and the customer gets an
 *     acknowledgement with the reference and when to expect an answer.
 *  4. Enyo reads it afterwards (automations.ts), so taking in mail stays fast.
 */
import { createHash } from 'node:crypto';
import { simpleParser, type ParsedMail } from 'mailparser';
import type { ImapFlow } from 'imapflow';
import { prisma } from '@ejo/database';
import { logFailure } from '@/lib/log';
import { closeImap, MailConnectError, openImap, withTimeout } from '@/lib/mail/transport';
import { MailCryptoError } from '@/lib/mail/crypto';
import { cleanBody, flattenAddresses, type AttachmentInfo } from '@/lib/mail/parse-core';
import { fetchChunk } from '@/lib/mail/sync';
import { htmlToText } from '@/lib/email-templates/layout';
import { renderSupportAcknowledgement } from '@/lib/email-templates/support-centre';
import {
  extractEntities, isOpen, loopGuard, newText, priorityFromText, promiseLabel, referencedIds, senderAuthenticated, ticketNumberIn, type HeaderBag,
} from './core';
import { letterheadFor, openTicket, queueById, responseUrl, sendFromSupport, subjectFor, supportConnection, supportEvent, supportSettings } from './server';

const FOLDER = 'INBOX';
const FIRST_RUN_HOURS = 24;
const PER_MAILBOX_RUN = 25;
const SENDER_HOURLY_MAX = 20;
const ACKS_PER_SENDER_DAY = 3;

const MAILBOX_SELECT = {
  id: true, organisationId: true, queueId: true, address: true, displayName: true, imapHost: true, imapPort: true, imapSecure: true,
  smtpHost: true, smtpPort: true, smtpSecure: true, username: true, secret: true, lastUid: true, uidValidity: true, createdAt: true,
} as const;
type Mailbox = { id: string; organisationId: string; queueId: string; address: string; displayName: string | null; imapHost: string; imapPort: number; imapSecure: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean; username: string; secret: string; lastUid: number; uidValidity: string | null; createdAt: Date };

export type IntakeResult = { mailboxes: number; failed: number; taken: number; replies: number; dropped: number };

/** Reads every active support mailbox (oldest first) within the time budget. */
export async function pollSupportMailboxes(budgetMs: number): Promise<IntakeResult> {
  const deadline = Date.now() + budgetMs;
  const result: IntakeResult = { mailboxes: 0, failed: 0, taken: 0, replies: 0, dropped: 0 };
  const boxes = await prisma.supportMailbox.findMany({ where: { status: { in: ['ACTIVE', 'ERROR'] } }, orderBy: [{ lastSyncAt: { sort: 'asc', nulls: 'first' } }], take: 30, select: MAILBOX_SELECT });
  for (const box of boxes) {
    if (Date.now() > deadline - 6_000) break;
    // Claim: one run per mailbox at a time (a run that started under 90 s ago wins).
    const claimed = await prisma.supportMailbox.updateMany({ where: { id: box.id, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(Date.now() - 90_000) } }] }, data: { lastSyncAt: new Date() } });
    if (!claimed.count) continue;
    result.mailboxes += 1;
    let client: ImapFlow | null = null;
    try {
      const s = supportConnection(box);
      client = await openImap(s.imap, 15_000);
      const r = await readMailbox(client, box, deadline);
      result.taken += r.taken;
      result.replies += r.replies;
      result.dropped += r.dropped;
      await prisma.supportMailbox.update({ where: { id: box.id }, data: { status: 'ACTIVE', lastError: null } });
    } catch (err) {
      result.failed += 1;
      const message = err instanceof MailConnectError ? err.message : err instanceof MailCryptoError ? 'The saved password could not be read. Connect the mailbox again.' : 'The mailbox could not be read just now. It will be tried again shortly.';
      if (!(err instanceof MailConnectError) && !(err instanceof MailCryptoError)) logFailure('Support mailbox read failed', err);
      await prisma.supportMailbox.update({ where: { id: box.id }, data: { status: 'ERROR', lastError: message.slice(0, 300) } }).catch(() => undefined);
    } finally {
      if (client) await closeImap(client);
    }
  }
  return result;
}

async function readMailbox(client: ImapFlow, box: Mailbox, deadline: number): Promise<{ taken: number; replies: number; dropped: number }> {
  const out = { taken: 0, replies: 0, dropped: 0 };
  const lock = await withTimeout(client.getMailboxLock(FOLDER, { readOnly: true }), 10_000, 'lock');
  try {
    const info = client.mailbox && typeof client.mailbox === 'object' ? client.mailbox : null;
    const validity = info?.uidValidity ? String(info.uidValidity) : null;
    let lastUid = box.lastUid;
    // The server renumbered the mailbox: carry on from what arrived since the last run (Message-IDs prevent doubles).
    if (validity && box.uidValidity && validity !== box.uidValidity) lastUid = 0;
    let uids: number[];
    if (!lastUid) {
      const since = new Date(Math.max(box.createdAt.getTime() - FIRST_RUN_HOURS * 3_600_000, Date.now() - 7 * 86_400_000));
      const found = await client.search({ since }, { uid: true });
      uids = (Array.isArray(found) ? found : []).sort((a, b) => a - b).slice(-PER_MAILBOX_RUN);
    } else {
      const found = await client.search({ uid: `${lastUid + 1}:*` }, { uid: true });
      uids = (Array.isArray(found) ? found : []).filter((u) => u > lastUid).sort((a, b) => a - b).slice(0, PER_MAILBOX_RUN);
    }
    const own = (await prisma.supportMailbox.findMany({ where: { organisationId: box.organisationId }, select: { address: true } })).map((m) => m.address);
    for (let i = 0; i < uids.length && Date.now() < deadline - 5_000; i += 5) {
      const chunk = await fetchChunk(client, uids.slice(i, i + 5));
      for (const f of chunk.sort((a, b) => a.uid - b.uid)) {
        if (Date.now() > deadline - 4_000) break;
        let parsed: ParsedMail | null = null;
        try {
          parsed = f.source ? await simpleParser(f.source, { skipImageLinks: true, skipTextToHtml: true, skipTextLinks: true, maxHtmlLengthToParse: 1_500_000 }) : null;
        } catch (err) {
          // An email the parser cannot read is skipped for good (never retried forever).
          logFailure('Support email could not be read', err);
        }
        if (parsed) {
          try {
            const r = await takeIn(box, parsed, own, f.internalDate);
            if (r === 'ticket') out.taken += 1; else if (r === 'reply') out.replies += 1; else out.dropped += 1;
          } catch (err) {
            // A passing problem (database, network): stop here and try this email again next run.
            logFailure('Support email could not be taken in', err);
            uids.length = 0;
            break;
          }
        }
        lastUid = Math.max(lastUid, f.uid);
        await prisma.supportMailbox.update({ where: { id: box.id }, data: { lastUid, ...(validity ? { uidValidity: validity } : {}) } });
      }
    }
    if (validity && validity !== box.uidValidity) await prisma.supportMailbox.update({ where: { id: box.id }, data: { uidValidity: validity, lastUid } });
  } finally {
    lock.release();
  }
  return out;
}

/** Raw header lines → lower-case name → value(s). */
function headerBag(p: ParsedMail): HeaderBag {
  const bag: Record<string, string | string[]> = {};
  for (const h of p.headerLines ?? []) {
    const value = h.line.slice(h.line.indexOf(':') + 1).replace(/\r?\n[ \t]+/g, ' ').trim();
    const k = h.key.toLowerCase();
    const prev = bag[k];
    bag[k] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  }
  return bag;
}

const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** One email → a reply on an existing ticket, a new ticket, or nothing. */
export async function takeIn(box: Mailbox, p: ParsedMail, ownAddresses: string[], internalDate: Date | null): Promise<'ticket' | 'reply' | 'dropped'> {
  const headers = headerBag(p);
  const from = flattenAddresses(p.from)[0];
  const fromAddress = lower(from?.address);
  const messageId = (p.messageId ?? '').slice(0, 300) || null;
  const subject = (p.subject ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300) || '(no subject)';
  const intakeKey = createHash('sha256').update(`${box.id}\n${messageId ?? `${fromAddress}\n${subject}\n${p.date?.toISOString() ?? internalDate?.toISOString() ?? ''}`}`).digest('hex');
  if (await prisma.supportReply.findUnique({ where: { intakeKey }, select: { id: true } })) return 'dropped';
  // A run stopped between opening the ticket and saving the email: finish that, never a second ticket.
  const half = messageId ? await prisma.supportTicket.findFirst({ where: { organisationId: box.organisationId, mailboxId: box.id, sourceMessageId: messageId }, select: { id: true } }) : null;

  const guard = loopGuard({ headers, from: fromAddress, ownAddresses });
  if (!guard.keep) return 'dropped';
  const recent = await prisma.supportReply.count({ where: { fromAddress, createdAt: { gte: new Date(Date.now() - 3_600_000) }, ticket: { organisationId: box.organisationId } } });
  const autoReply = guard.autoReply && recent < SENDER_HOURLY_MAX;

  if (half) {
    const rawHalf = p.text?.trim() ? p.text : typeof p.html === 'string' ? htmlToText(p.html.slice(0, 1_500_000)) : '';
    await prisma.supportReply.create({ data: { ticketId: half.id, fromCustomer: true, kind: 'CUSTOMER', visibility: 'PUBLIC', body: newText(cleanBody(rawHalf)) || '(no text)', emailMessageId: messageId, fromAddress, intakeKey } });
    return 'ticket';
  }
  const rawText = p.text?.trim() ? p.text : typeof p.html === 'string' ? htmlToText(p.html.slice(0, 1_500_000).replace(/<(style|script|title)\b[\s\S]*?<\/\1>/gi, '')) : '';
  const body = newText(cleanBody(rawText)) || '(no text — see the attachments or the original email)';
  const attachments: AttachmentInfo[] = (p.attachments ?? []).filter((a) => !(a.related && a.contentDisposition === 'inline')).slice(0, 20).map((a) => ({ name: (a.filename || 'attachment').slice(0, 200), size: a.size ?? 0 }));
  const at = p.date && !Number.isNaN(p.date.getTime()) && p.date.getTime() < Date.now() + 86_400_000 ? p.date : internalDate ?? new Date();

  // ── 2. An existing ticket? (tag or Message-ID, and only from that ticket's customer)
  const refs = referencedIds(p.inReplyTo, p.references as string | string[] | undefined);
  const number = ticketNumberIn(subject, body);
  const byRef = refs.length
    ? await prisma.supportReply.findFirst({ where: { emailMessageId: { in: refs }, ticket: { organisationId: box.organisationId } }, orderBy: { createdAt: 'desc' }, select: { ticketId: true } })
      ?? await prisma.supportTicket.findFirst({ where: { organisationId: box.organisationId, sourceMessageId: { in: refs } }, select: { id: true } }).then((t) => (t ? { ticketId: t.id } : null))
    : null;
  const candidate = byRef
    ? await prisma.supportTicket.findFirst({ where: { id: byRef.ticketId, organisationId: box.organisationId } })
    : number ? await prisma.supportTicket.findFirst({ where: { number, organisationId: box.organisationId } }) : null;
  let ticket = candidate;
  if (ticket) {
    const customerEmail = ticket.customerId ? lower((await prisma.customer.findFirst({ where: { id: ticket.customerId, organisationId: box.organisationId }, select: { email: true } }))?.email) : '';
    if (fromAddress !== lower(ticket.contactEmail) && fromAddress !== customerEmail) ticket = null;
  }

  if (ticket && ticket.status !== 'CLOSED') {
    const reopened = ticket.status === 'RESOLVED';
    await prisma.$transaction([
      prisma.supportReply.create({ data: { ticketId: ticket.id, fromCustomer: true, kind: 'CUSTOMER', visibility: 'PUBLIC', body, emailMessageId: messageId, fromAddress, attachments: attachments.length ? attachments : undefined, intakeKey, createdAt: at } }),
      prisma.supportTicket.updateMany({
        where: { id: ticket.id, status: ticket.status },
        data: {
          status: ticket.status === 'ON_HOLD' ? 'ON_HOLD' : 'OPEN', resolvedAt: null, lastCustomerAt: at, pendingSince: null, nudgeCount: 0,
          ...(reopened ? { reopenCount: { increment: 1 } } : {}),
          // Enyo answered and the customer wrote again: not resolved by Enyo after all.
          ...(ticket.aiOutcome === 'ANSWERED' ? { aiOutcome: 'ESCALATED', handoverReason: [ticket.handoverReason, 'repeat_contact'].filter(Boolean).join(',') } : {}),
        },
      }),
    ]);
    // Someone changed the status in between: still bring it back to the team.
    await prisma.supportTicket.updateMany({ where: { id: ticket.id, status: { in: ['WAITING_ON_CUSTOMER', 'RESOLVED'] }, lastCustomerAt: { lt: at } }, data: { status: 'OPEN', resolvedAt: null, lastCustomerAt: at, pendingSince: null } });
    await supportEvent({ organisationId: box.organisationId, ticketId: ticket.id, action: 'support.customer_replied', metadata: { actor: 'email', number: ticket.number, reopened } });
    return 'reply';
  }

  // ── 3. A new ticket (or a follow-up to a closed one).
  const queue = await queueById(box.organisationId, box.queueId);
  const customer = fromAddress ? await prisma.customer.findFirst({ where: { organisationId: box.organisationId, email: { equals: fromAddress, mode: 'insensitive' } }, select: { id: true, fullName: true, phone: true } }) : null;
  const followUp = ticket && ticket.status === 'CLOSED' ? ticket : null;
  const cleanSubject = subject.replace(/\[#SUP-\d{4}-\d{6}\]\s*/g, '').replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, '').trim() || 'Email enquiry';
  const priority = priorityFromText(`${cleanSubject}\n${body}`, null);
  const entities = extractEntities(`${cleanSubject}\n${body}`);
  const created = await openTicket({
    organisationId: box.organisationId, channel: 'EMAIL', queue, mailboxId: box.id, branchId: followUp?.branchId ?? null,
    customerId: customer?.id ?? null, contactName: customer?.fullName ?? from?.name?.trim() ?? fromAddress.split('@')[0] ?? 'Customer', contactEmail: fromAddress || null, contactPhone: customer?.phone ?? null,
    subject: followUp ? `Follow-up to ${followUp.number}: ${cleanSubject}` : cleanSubject,
    summary: body.replace(/\s+/g, ' ').slice(0, 400), priority, entities, verified: Boolean(customer && senderAuthenticated(headers)), authenticatedSender: senderAuthenticated(headers), sourceMessageId: messageId, openedAt: at,
    aiPending: queue.aiMode !== 'OFF' && autoReply, handoverReason: queue.aiMode === 'OFF' ? 'queue_off' : !autoReply ? 'automated_sender' : null,
  });
  await prisma.supportReply.create({ data: { ticketId: created.id, fromCustomer: true, kind: 'CUSTOMER', visibility: 'PUBLIC', body, emailMessageId: messageId, fromAddress, attachments: attachments.length ? attachments : undefined, intakeKey, createdAt: at } });
  await supportEvent({ organisationId: box.organisationId, ticketId: created.id, action: 'support.ticket_opened', metadata: { actor: 'email', number: created.number, channel: 'EMAIL', queue: queue.name, priority, ...(followUp ? { followUpOf: followUp.number } : {}), ...(customer ? { customerId: customer.id } : {}), ...(created.assignedToId ? { assignedTo: created.assignedToId } : {}) } });

  // ── The acknowledgement: reference, team, when to expect an answer.
  if (autoReply && queue.autoAcknowledge && fromAddress) {
    const acksToday = await prisma.supportReply.count({ where: { kind: 'SYSTEM', ticket: { organisationId: box.organisationId, contactEmail: fromAddress }, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
    if (acksToday < ACKS_PER_SENDER_DAY) {
      try {
        const settings = await supportSettings(box.organisationId);
        const head = await letterheadFor(box.organisationId, null);
        const m = renderSupportAcknowledgement({
          ...head, queueName: queue.name, number: created.number, subject: cleanSubject, customerName: customer?.fullName ?? from?.name ?? '',
          responseUrl: responseUrl(created.token), promise: promiseLabel(created.dueFirstResponseAt), open: isOpen(new Date(), settings.hours, settings.holidays),
        });
        const sent = await sendFromSupport({ organisationId: box.organisationId, ticketId: created.id, mailboxId: box.id, to: fromAddress, subject: subjectFor(created.number, `Re: ${cleanSubject}`), html: m.html, inReplyTo: messageId, references: refs, automatic: true, timeoutMs: 12_000 });
        await prisma.supportReply.create({ data: { ticketId: created.id, kind: 'SYSTEM', visibility: 'PUBLIC', body: `Acknowledgement sent: reference ${created.number}, answer ${promiseLabel(created.dueFirstResponseAt)}.`, emailMessageId: sent.messageId } });
      } catch (err) {
        logFailure('Support acknowledgement failed', err);
      }
    }
  }
  return 'ticket';
}
