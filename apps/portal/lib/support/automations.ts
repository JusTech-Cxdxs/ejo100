import 'server-only';
/**
 * The Support centre's scheduled work (every few minutes, time-budgeted):
 *
 *  1. Chat hand-overs from the website / customer portal get a queue, targets
 *     and an owner like email tickets.
 *  2. Enyo reads new email tickets: topic, priority, mood, a summary for the
 *     colleague — then answers by itself (AUTO queues, only when every rule
 *     in core.aiDecision allows it) or leaves a draft reply for a person, and
 *     records why a person is needed.
 *  3. Targets: a warning before the first answer is due, and a breach when it
 *     is late (both into the staff bell through the audit trail).
 *  4. Waiting on the customer: up to two friendly reminders, then resolved.
 *     Enyo's answers with no further question count as resolved (assumed).
 *  5. Resolved → closed after the set days; "How did we do?" once per ticket.
 * Each step is idempotent: it changes only rows still in the state it read.
 */
import { prisma } from '@ejo/database';
import { logFailure } from '@/lib/log';
import { renderSupportNudge, renderSupportReply, renderSupportSatisfaction } from '@/lib/email-templates/support-centre';
import { SUPPORT_STATUS_FOR_CUSTOMER } from '@/lib/support-rules';
import { getEnyoSettings } from '@/lib/enyo/settings';
import { PLATFORM } from '@/lib/brand';
import { aiDecision, asPriority, dueDates, priorityFromText, sensitiveReasons } from './core';
import { aiReply, letterheadFor, newToken, nextAssignee, queueById, responseUrl, sendFromSupport, subjectFor, supportEvent, supportSettings, triageEmail } from './server';

export type AutomationResult = { normalised: number; read: number; aiAnswered: number; drafted: number; warned: number; breached: number; nudged: number; resolved: number; closed: number; surveyed: number; assumed: number };

export async function runSupportAutomations(budgetMs: number): Promise<AutomationResult> {
  const deadline = Date.now() + budgetMs;
  const r: AutomationResult = { normalised: 0, read: 0, aiAnswered: 0, drafted: 0, warned: 0, breached: 0, nudged: 0, resolved: 0, closed: 0, surveyed: 0, assumed: 0 };
  const step = async (name: string, fn: () => Promise<void>) => {
    if (Date.now() > deadline - 3_000) return;
    try { await fn(); } catch (err) { logFailure(`Support automation failed: ${name}`, err); }
  };
  await step('normalise', async () => { r.normalised = await normaliseHandovers(); });
  await step('targets', async () => { const t = await checkTargets(); r.warned = t.warned; r.breached = t.breached; });
  await step('waiting', async () => { const w = await followUpWaiting(deadline); r.nudged = w.nudged; r.resolved = w.resolved; r.assumed = w.assumed; });
  await step('close', async () => { r.closed = await closeResolved(); });
  await step('survey', async () => { r.surveyed = await sendSurveys(deadline); });
  // Enyo last: it is the slowest step and uses whatever time is left.
  await step('enyo', async () => { const a = await enyoReads(deadline); r.read = a.read; r.aiAnswered = a.answered; r.drafted = a.drafted; });
  return r;
}

// 1 ───────────────────────────────────────────────────────── chat hand-overs

async function normaliseHandovers(): Promise<number> {
  const rows = await prisma.supportTicket.findMany({ where: { queueId: null }, orderBy: { createdAt: 'asc' }, take: 50, select: { id: true, organisationId: true, createdAt: true, subject: true, summary: true, assignedToId: true, token: true, priority: true, status: true } });
  let n = 0;
  for (const t of rows) {
    const queue = await queueById(t.organisationId, null);
    const settings = await supportSettings(t.organisationId);
    const priority = priorityFromText(`${t.subject}\n${t.summary}`, t.priority);
    const due = dueDates(t.createdAt, asPriority(priority), queue.targets, settings.hours, settings.holidays);
    const assignee = t.assignedToId ?? await nextAssignee(t.organisationId, queue.id);
    const done = await prisma.supportTicket.updateMany({
      where: { id: t.id, queueId: null },
      data: { queueId: queue.id, priority, dueFirstResponseAt: due.first, dueResolutionAt: due.resolve, token: t.token ?? newToken(), lastCustomerAt: t.createdAt, handoverReason: 'chat_handover', ...(assignee ? { assignedToId: assignee } : {}) },
    });
    n += done.count;
  }
  return n;
}

// 2 ───────────────────────────────────────────────────────── Enyo reads

const ENYO_PER_RUN = 6;

async function enyoReads(deadline: number): Promise<{ read: number; answered: number; drafted: number }> {
  const out = { read: 0, answered: 0, drafted: 0 };
  const rows = await prisma.supportTicket.findMany({ where: { aiPendingAt: { not: null } }, orderBy: { aiPendingAt: 'asc' }, take: ENYO_PER_RUN, select: { id: true } });
  for (const { id } of rows) {
    if (Date.now() > deadline - 30_000) break;
    // Claim it so two runs never answer twice.
    const claimed = await prisma.supportTicket.updateMany({ where: { id, aiPendingAt: { not: null } }, data: { aiPendingAt: null } });
    if (!claimed.count) continue;
    const t = await prisma.supportTicket.findUnique({ where: { id }, include: { replies: { where: { fromCustomer: true }, orderBy: { createdAt: 'desc' }, take: 3 } } });
    if (!t) continue;
    out.read += 1;
    const queue = await queueById(t.organisationId, t.queueId);
    const settings = await supportSettings(t.organisationId);
    const text = `${t.subject}\n\n${t.replies[0]?.body ?? t.summary}`;
    const triage = await triageEmail(t.organisationId, { queueName: queue.name, subject: t.subject, body: t.replies[0]?.body ?? t.summary });
    const priority = priorityFromText(text, triage?.priority ?? t.priority);
    const due = !t.firstResponseAt && priority !== t.priority ? dueDates(t.createdAt, priority, queue.targets, settings.hours, settings.holidays) : null;
    await prisma.supportTicket.update({
      where: { id: t.id },
      data: {
        priority, ...(due ? { dueFirstResponseAt: due.first, dueResolutionAt: due.resolve } : {}),
        ...(triage ? { topic: triage.topic, sentiment: triage.sentiment, language: triage.language, ...(triage.summary ? { summary: triage.summary } : {}) } : {}),
      },
    });
    const repeatContact = t.reopenCount > 0 || t.replies.length > 1;
    const pre = aiDecision({ mode: queue.aiMode, triage, text, threshold: settings.aiThreshold, answerConfidence: 1, hasSources: true, repeatContact, autoReplyAllowed: true });
    const mayAnswer = queue.aiMode === 'AUTO' && pre.action === 'answer';
    const ai = queue.aiMode === 'OFF' ? null : await aiReply(t.organisationId, { customerName: t.contactName, subject: t.subject, body: t.replies[0]?.body ?? t.summary, topic: triage?.topic ?? null, mode: mayAnswer ? 'answer' : 'draft' });
    const decision = aiDecision({ mode: queue.aiMode, triage, text, threshold: settings.aiThreshold, answerConfidence: ai?.confidence ?? null, hasSources: ai?.hasSources ?? false, repeatContact, autoReplyAllowed: true });
    const reasons = ai?.needsPerson ? [...new Set([...decision.reasons, 'low_confidence'])] : decision.reasons;

    if (decision.action === 'answer' && ai && !ai.needsPerson && t.contactEmail && t.status === 'OPEN') {
      try {
        const head = await letterheadFor(t.organisationId, t.branchId);
        const assistant = (await getEnyoSettings(t.organisationId)).displayName || PLATFORM.assistant;
        const m = renderSupportReply({ ...head, queueName: queue.name, number: t.number, subject: t.subject, customerName: t.contactName, responseUrl: responseUrl(t.token), body: ai.reply, by: 'ai', assistantName: assistant, signature: null, statusLabel: SUPPORT_STATUS_FOR_CUSTOMER.WAITING_ON_CUSTOMER });
        const sent = await sendFromSupport({ organisationId: t.organisationId, ticketId: t.id, mailboxId: t.mailboxId, to: t.contactEmail, subject: subjectFor(t.number, `Re: ${t.subject}`), html: m.html, inReplyTo: t.replies[0]?.emailMessageId ?? t.sourceMessageId, automatic: true });
        const now = new Date();
        const moved = await prisma.supportTicket.updateMany({ where: { id: t.id, status: 'OPEN' }, data: { status: 'WAITING_ON_CUSTOMER', firstResponseAt: t.firstResponseAt ?? now, lastAgentAt: now, pendingSince: now, aiOutcome: 'ANSWERED', aiAnsweredAt: now, handoverReason: null } });
        if (moved.count) {
          await prisma.supportReply.create({ data: { ticketId: t.id, kind: 'AI', visibility: 'PUBLIC', aiDrafted: true, body: ai.reply, emailMessageId: sent.messageId } });
          await supportEvent({ organisationId: t.organisationId, ticketId: t.id, action: 'support.ai_answered', metadata: { number: t.number, confidence: Math.round(ai.confidence * 100) / 100, used: ai.used.length, model: ai.model } });
          out.answered += 1;
          continue;
        }
      } catch (err) {
        logFailure('Support AI answer could not be sent', err);
        reasons.push('low_confidence');
      }
    }
    if (ai && decision.action !== 'none') {
      await prisma.supportReply.create({ data: { ticketId: t.id, kind: 'AI_DRAFT', visibility: 'INTERNAL', aiDrafted: true, body: ai.reply } });
      out.drafted += 1;
    }
    const why = [...new Set([...(t.handoverReason ? t.handoverReason.split(',') : []), ...reasons, ...(triage ? [] : ['triage_failed'])])].filter(Boolean);
    await prisma.supportTicket.update({ where: { id: t.id }, data: { handoverReason: why.join(',') || null } });
    // Anything sensitive in an urgent queue is worth a ping now, not at the target.
    if (sensitiveReasons(text).includes('safety')) await supportEvent({ organisationId: t.organisationId, ticketId: t.id, action: 'support.urgent', metadata: { number: t.number, reasons: why } });
  }
  return out;
}

// 3 ───────────────────────────────────────────────────────── targets

async function checkTargets(): Promise<{ warned: number; breached: number }> {
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 60_000);
  const open = { status: { in: ['OPEN' as const, 'ON_HOLD' as const] }, firstResponseAt: null };
  const warn = await prisma.supportTicket.findMany({ where: { ...open, slaWarnedAt: null, dueFirstResponseAt: { gt: now, lte: soon } }, take: 100, select: { id: true, organisationId: true, number: true, assignedToId: true, dueFirstResponseAt: true } });
  let warned = 0;
  for (const t of warn) {
    const c = await prisma.supportTicket.updateMany({ where: { id: t.id, slaWarnedAt: null }, data: { slaWarnedAt: now } });
    if (!c.count) continue;
    warned += 1;
    await supportEvent({ organisationId: t.organisationId, ticketId: t.id, action: 'support.sla_warning', metadata: { number: t.number, due: t.dueFirstResponseAt?.toISOString(), ...(t.assignedToId ? { assignedTo: t.assignedToId } : {}) } });
  }
  const late = await prisma.supportTicket.findMany({ where: { ...open, slaBreachedAt: null, dueFirstResponseAt: { lte: now } }, take: 100, select: { id: true, organisationId: true, number: true, assignedToId: true, priority: true } });
  let breached = 0;
  for (const t of late) {
    const c = await prisma.supportTicket.updateMany({ where: { id: t.id, slaBreachedAt: null }, data: { slaBreachedAt: now, slaWarnedAt: now } });
    if (!c.count) continue;
    breached += 1;
    await supportEvent({ organisationId: t.organisationId, ticketId: t.id, action: 'support.sla_breached', metadata: { number: t.number, priority: t.priority, ...(t.assignedToId ? { assignedTo: t.assignedToId } : {}) } });
  }
  return { warned, breached };
}

// 4 ───────────────────────────────────────────────────────── waiting on the customer

async function followUpWaiting(deadline: number): Promise<{ nudged: number; resolved: number; assumed: number }> {
  const out = { nudged: 0, resolved: 0, assumed: 0 };
  const now = Date.now();
  // Enyo answered three days ago and the customer said nothing more: resolved by Enyo (assumed).
  const assumed = await prisma.supportTicket.updateMany({ where: { aiOutcome: 'ANSWERED', aiAnsweredAt: { lte: new Date(now - 72 * 3_600_000) } }, data: { aiOutcome: 'ASSUMED' } });
  out.assumed = assumed.count;
  const waiting = await prisma.supportTicket.findMany({
    where: { status: 'WAITING_ON_CUSTOMER', pendingSince: { not: null } },
    orderBy: { pendingSince: 'asc' },
    take: 60,
    select: { id: true, organisationId: true, number: true, subject: true, contactName: true, contactEmail: true, token: true, pendingSince: true, nudgeCount: true, queueId: true, branchId: true, mailboxId: true, aiOutcome: true, sourceMessageId: true },
  });
  const settingsCache = new Map<string, Awaited<ReturnType<typeof supportSettings>>>();
  for (const t of waiting) {
    if (Date.now() > deadline - 8_000) break;
    const s = settingsCache.get(t.organisationId) ?? await supportSettings(t.organisationId);
    settingsCache.set(t.organisationId, s);
    const waitedH = (now - t.pendingSince!.getTime()) / 3_600_000;
    if (waitedH >= s.autoResolveDays * 24) {
      const c = await prisma.supportTicket.updateMany({ where: { id: t.id, status: 'WAITING_ON_CUSTOMER' }, data: { status: 'RESOLVED', resolvedAt: new Date(), pendingSince: null, ...(t.aiOutcome === 'ANSWERED' ? { aiOutcome: 'ASSUMED' } : {}) } });
      if (c.count) {
        out.resolved += 1;
        await supportEvent({ organisationId: t.organisationId, ticketId: t.id, action: 'support.auto_resolved', metadata: { number: t.number, waitedDays: Math.round(waitedH / 24) } });
      }
      continue;
    }
    if (t.nudgeCount >= 2 || !t.contactEmail || waitedH < s.nudgeAfterHours * (t.nudgeCount + 1)) continue;
    const c = await prisma.supportTicket.updateMany({ where: { id: t.id, status: 'WAITING_ON_CUSTOMER', nudgeCount: t.nudgeCount }, data: { nudgeCount: { increment: 1 } } });
    if (!c.count) continue;
    try {
      const queue = await queueById(t.organisationId, t.queueId);
      const head = await letterheadFor(t.organisationId, t.branchId);
      const last = t.nudgeCount === 1;
      const m = renderSupportNudge({ ...head, queueName: queue.name, number: t.number, subject: t.subject, customerName: t.contactName, responseUrl: responseUrl(t.token), closesInDays: Math.max(1, Math.ceil(s.autoResolveDays - waitedH / 24)), last });
      const sent = await sendFromSupport({ organisationId: t.organisationId, ticketId: t.id, mailboxId: t.mailboxId, to: t.contactEmail, subject: subjectFor(t.number, `Re: ${t.subject}`), html: m.html, inReplyTo: t.sourceMessageId, automatic: true });
      await prisma.supportReply.create({ data: { ticketId: t.id, kind: 'SYSTEM', visibility: 'PUBLIC', body: last ? 'Second reminder sent: we will mark this resolved if we do not hear back.' : 'Reminder sent: are you still waiting for help?', emailMessageId: sent.messageId } });
      out.nudged += 1;
    } catch (err) {
      logFailure('Support reminder could not be sent', err);
    }
  }
  return out;
}

// 5 ───────────────────────────────────────────────────────── close and survey

async function closeResolved(): Promise<number> {
  const rows = await prisma.supportTicket.findMany({ where: { status: 'RESOLVED', resolvedAt: { not: null } }, take: 200, select: { id: true, organisationId: true, resolvedAt: true } });
  let n = 0;
  const cache = new Map<string, number>();
  for (const t of rows) {
    const days = cache.get(t.organisationId) ?? (await supportSettings(t.organisationId)).closeAfterDays;
    cache.set(t.organisationId, days);
    if (Date.now() - t.resolvedAt!.getTime() < days * 86_400_000) continue;
    const c = await prisma.supportTicket.updateMany({ where: { id: t.id, status: 'RESOLVED' }, data: { status: 'CLOSED', closedAt: new Date() } });
    n += c.count;
  }
  return n;
}

const SURVEY_AFTER_H = 4;

async function sendSurveys(deadline: number): Promise<number> {
  const rows = await prisma.supportTicket.findMany({
    where: { status: { in: ['RESOLVED', 'CLOSED'] }, csatRequestedAt: null, csatScore: null, contactEmail: { not: null }, resolvedAt: { lte: new Date(Date.now() - SURVEY_AFTER_H * 3_600_000), gte: new Date(Date.now() - 14 * 86_400_000) } },
    orderBy: { resolvedAt: 'asc' },
    take: 25,
    select: { id: true, organisationId: true, number: true, subject: true, contactName: true, contactEmail: true, token: true, queueId: true, branchId: true, mailboxId: true, sourceMessageId: true },
  });
  let n = 0;
  for (const t of rows) {
    if (Date.now() > deadline - 8_000) break;
    const s = await supportSettings(t.organisationId);
    const c = await prisma.supportTicket.updateMany({ where: { id: t.id, csatRequestedAt: null }, data: { csatRequestedAt: new Date() } });
    if (!c.count || !s.csatEnabled || !t.token) continue;
    try {
      const queue = await queueById(t.organisationId, t.queueId);
      const head = await letterheadFor(t.organisationId, t.branchId);
      const m = renderSupportSatisfaction({ ...head, queueName: queue.name, number: t.number, subject: t.subject, customerName: t.contactName, responseUrl: responseUrl(t.token) });
      await sendFromSupport({ organisationId: t.organisationId, ticketId: t.id, mailboxId: t.mailboxId, to: t.contactEmail!, subject: subjectFor(t.number, 'How did we do?'), html: m.html, inReplyTo: t.sourceMessageId, automatic: true });
      n += 1;
    } catch (err) {
      logFailure('Support survey could not be sent', err);
    }
  }
  return n;
}
