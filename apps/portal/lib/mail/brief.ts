import { prisma } from '@ejo/database';
import { asData, complete, looksLikeInjection } from '@ejo/enyo';
import { enyoReady } from '@/lib/enyo/settings';
import { buildBriefMessages, detectRefs, parseBrief } from './brief-core';
import { splitAttachments } from './parse-core';

/**
 * Enyo's brief of new messages — only for a mailbox whose owner said yes, and
 * only while the organisation has "Enyo for email" switched on and a model is
 * configured. A few messages per sync (newest first), each with the fast
 * model, inside the sync's time budget. The email is wrapped as untrusted
 * data; nothing in it can change what Enyo does. Server-only.
 *
 * No ERP data is read here: references found in the email are stored as
 * text, and turned into links only when the owner opens the message, from
 * what THEY may open (lib/mail/refs.ts).
 */
const PER_SYNC = 10;
/** Empty briefs allowed before Enyo stops trying a message by itself (the owner can still ask). */
export const MAX_TRIES = 2;

export async function briefNewMessages(organisationId: string, accountId: string, messageIds: string[], deadline: number, opts: { again?: boolean; owner?: boolean } = {}): Promise<number> {
  const ready = await enyoReady(organisationId, 'mailAi');
  if (!ready.ready) return 0;
  const account = await prisma.mailAccount.findUnique({ where: { id: accountId }, select: { address: true, aiConsentAt: true } });
  if (!account?.aiConsentAt) return 0;
  const rows = await prisma.mailMessage.findMany({
    // `again`: also messages tried before without a summary (the owner asked, or the model has changed).
    // `owner`: the owner pressed "Brief this email" — try even after earlier empty briefs.
    where: { id: { in: messageIds }, accountId, ...(opts.again ? { aiSummary: null, ...(opts.owner ? {} : { aiTries: { lt: MAX_TRIES } }) } : { aiAt: null }) },
    orderBy: { receivedAt: 'desc' },
    take: PER_SYNC,
    select: { id: true, fromAddress: true, fromName: true, subject: true, bodyText: true, receivedAt: true },
  });
  let done = 0;
  for (const m of rows) {
    if (Date.now() > deadline - 4_000) break;
    const { body, attachments } = splitAttachments(m.bodyText);
    const found = detectRefs(`${m.subject}\n${body}`, m.fromAddress, account.address);
    const messages = buildBriefMessages({ fromName: m.fromName, fromAddress: m.fromAddress, subject: m.subject, receivedAt: m.receivedAt.toISOString(), body, attachments: attachments.map((a) => a.name) }, asData);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(2_000, Math.min(15_000, deadline - Date.now() - 2_000)));
    try {
      const answer = await complete({ ...ready.config, timeoutMs: Math.min(ready.config.timeoutMs, 15_000) }, { model: ready.config.fastModel, messages, temperature: 0, maxTokens: 400, signal: controller.signal });
      const brief = parseBrief(answer.content, found);
      // Mark it either way, so a message the model cannot brief is not retried on every sync.
      await prisma.mailMessage.update({
        where: { id: m.id },
        data: brief
          ? { aiSummary: brief.summary, aiCategory: brief.category, aiPriority: brief.priority, aiActions: brief.actions as never, linkedRefs: brief.refs as never, aiAt: new Date() }
          : { linkedRefs: found as never, aiAt: new Date(), aiTries: { increment: 1 } },
      });
      done += brief ? 1 : 0;
    } catch {
      // The model is down or slow: leave it for the next sync.
      break;
    } finally {
      clearTimeout(timer);
    }
  }
  return done;
}

/** For the reading pane: shows a calm note when an email tries to give Enyo orders. */
export function suspiciousEmail(body: string): boolean {
  return looksLikeInjection(body);
}
