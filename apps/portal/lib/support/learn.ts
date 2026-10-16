import 'server-only';
/**
 * Enyo learns from how colleagues resolve support requests.
 *
 * When a request is resolved with a colleague's reply (not Enyo's), the
 * customer's question and that reply become a CANDIDATE answer — names,
 * phones, emails, plates and links removed — for an administrator to
 * approve on the Enyo learning page. Approved answers are what Enyo uses
 * for customers (support emails, chat): it never learns by itself.
 *
 * A colleague's own help request is learned for colleagues (STAFF), never for customers.
 *
 * Not learned: requests about the customer's own records (job status,
 * invoices, warranty decisions, complaints) and anything naming a plate,
 * VIN or record number — those answers are about one customer, not general.
 */
import { prisma } from '@ejo/database';
import { scrubText } from '@/lib/enyo/predict/dataset-core';
import { tokenise } from '@/lib/enyo/predict/text';
import { scrubKeepingLines } from '@/lib/enyo/learned-core';
import { RECORD_TOPICS, type Topic } from './ai-core';
import { extractEntities } from './core';

export async function learnFromResolution(o: { ticketId: string; organisationId: string; userId: string; replyId?: string }): Promise<'learned' | 'skipped'> {
  const t = await prisma.supportTicket.findFirst({
    where: { id: o.ticketId, organisationId: o.organisationId },
    select: { id: true, topic: true, contactName: true, subject: true, requesterUserId: true, replies: { orderBy: { createdAt: 'asc' }, take: 200, select: { id: true, kind: true, visibility: true, fromCustomer: true, body: true, authorUserId: true } } },
  });
  if (!t) return 'skipped';
  if (t.topic && RECORD_TOPICS.includes(t.topic as Topic)) return 'skipped';
  const question = t.replies.find((r) => r.fromCustomer)?.body ?? '';
  const answers = t.replies.filter((r) => r.kind === 'AGENT' && r.visibility === 'PUBLIC' && r.authorUserId);
  const answer = (o.replyId ? answers.find((r) => r.id === o.replyId) : answers[answers.length - 1])?.body ?? '';
  if (question.trim().length < 10 || answer.trim().length < 10) return 'skipped';
  const e = extractEntities(`${t.subject}\n${question}\n${answer}`);
  if (e.plates.length || e.vins.length || e.records.length) return 'skipped';
  const staff = await prisma.user.findMany({ where: { organisationId: o.organisationId }, select: { fullName: true }, take: 2000 }).catch(() => []);
  const names = [t.contactName, ...staff.map((s) => s.fullName)].filter(Boolean);
  const q = scrubText(`${t.subject}. ${question}`, names).slice(0, 500);
  const a = scrubKeepingLines(answer, names, 4000);
  const tokens = tokenise(q);
  if (tokens.length < 3 || !a) return 'skipped';
  // An administrator removed this one before: never suggested again.
  const before = await prisma.enyoLearnedAnswer.findUnique({ where: { sourceId: `sup:${t.id}` }, select: { status: true } });
  if (before?.status === 'REJECTED') return 'skipped';
  await prisma.enyoLearnedAnswer.upsert({
    where: { sourceId: `sup:${t.id}` },
    create: { organisationId: o.organisationId, channel: t.requesterUserId ? 'STAFF' : 'SUPPORT', question: q, answer: a, tokens, source: 'support', sourceId: `sup:${t.id}`, createdById: o.userId, status: 'PENDING' },
    // A changed answer goes back for approval.
    update: { question: q, answer: a, tokens, status: 'PENDING', approvedById: null, approvedAt: null },
  });
  return 'learned';
}
