'use server';

import { prisma, type Prisma } from '@ejo/database';
import { authorize, myOrganisationId, reachWhere, NOT_AVAILABLE } from '@/lib/authz/server';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { ticketReachWhere } from '@/lib/support-rules';
import { fenceStaffHelp } from '@/lib/support/reach';
import { reasonLabels } from '@/lib/support/core';
import { RECORD_TOPICS, TOPIC_LABEL, asTopic, type Topic } from '@/lib/support/ai-core';
import { asFailureReason, asVerdict, enyoMeasures, FAILURE_LABEL, gapReport, VERDICT_LABEL, type Gap } from '@/lib/support/monitor-core';
import { scrubText } from '@/lib/enyo/predict/dataset-core';
import { tokenise } from '@/lib/enyo/predict/text';
import { scrubKeepingLines } from '@/lib/enyo/learned-core';
import { extractEntities } from '@/lib/support/core';
import { cleanReply, REPLY_MAX } from '@/lib/support-rules';

/**
 * Enyo's replies in the Support centre, for the people who answer support:
 * every answer Enyo sent by itself and every draft it wrote — with what it
 * knew about the sender, how sure it was and why it handed over — to check,
 * correct and learn from. A correction becomes a candidate answer for an
 * administrator to approve (never used before that). The report shows why
 * Enyo could not resolve requests and what to fix. Fenced like the Support
 * centre (organisation, branch reach, colleagues' private help requests).
 */

class MonitorError extends Error {}

const PERM = 'support.tickets.manage' as const;
type TicketWhere = Prisma.SupportTicketWhereInput;

export const ENYO_REPLY_FILTERS = ['to_check', 'sent', 'drafts', 'checked', 'wrong'] as const;
export type EnyoReplyFilter = (typeof ENYO_REPLY_FILTERS)[number];

export type EnyoReplyRow = {
  id: string; kind: 'AI' | 'AI_DRAFT'; body: string; createdAt: Date; confidence: number | null; model: string | null;
  ticket: { id: string; number: string; subject: string; contactName: string; topic: string | null; outcome: string | null; handover: string[] };
  question: string | null;
  sender: { kind: string | null; proven: boolean | null; records: string[] };
  review: { status: string | null; label: string | null; reason: string | null; reasonLabel: string | null; note: string | null; by: string | null; at: Date | null };
};

export type EnyoMonitor = {
  filter: EnyoReplyFilter; days: number; rows: EnyoReplyRow[];
  counts: Record<EnyoReplyFilter, number>;
  measures: ReturnType<typeof enyoMeasures>;
  gaps: Gap[]; rightlyHuman: { reason: string; label: string; count: number }[];
};

const asFilter = (v: unknown): EnyoReplyFilter => (typeof v === 'string' && (ENYO_REPLY_FILTERS as readonly string[]).includes(v) ? (v as EnyoReplyFilter) : 'to_check');

function replyWhere(f: EnyoReplyFilter): Prisma.SupportReplyWhereInput {
  switch (f) {
    case 'sent': return { kind: 'AI' };
    case 'drafts': return { kind: 'AI_DRAFT' };
    case 'checked': return { kind: { in: ['AI', 'AI_DRAFT'] }, reviewStatus: { in: ['GOOD', 'FIXED', 'WRONG'] } };
    case 'wrong': return { kind: { in: ['AI', 'AI_DRAFT'] }, OR: [{ reviewStatus: { in: ['FIXED', 'WRONG'] } }, { kind: 'AI', ticket: { aiOutcome: 'ESCALATED' } }] };
    // Every answer Enyo sent by itself waits for a person's check; drafts are checked by being used.
    default: return { kind: 'AI', reviewStatus: null };
  }
}

export async function getEnyoMonitor(input: { filter?: string; days?: number } = {}): Promise<EnyoMonitor> {
  await authorize(PERM, undefined, 'getEnyoMonitor');
  await requireUser();
  const reach = (await fenceStaffHelp(ticketReachWhere(await reachWhere(PERM), await myOrganisationId()))) as TicketWhere;
  const filter = asFilter(input.filter);
  const days = [7, 30, 90].includes(Number(input.days)) ? Number(input.days) : 30;
  const since = new Date(Date.now() - days * 86_400_000);
  const base = (f: EnyoReplyFilter): Prisma.SupportReplyWhereInput => ({ AND: [replyWhere(f), { createdAt: { gte: since } }, { ticket: reach }] });
  const [rows, ...counts] = await Promise.all([
    prisma.supportReply.findMany({
      where: base(filter),
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: {
        id: true, kind: true, body: true, createdAt: true, aiConfidence: true, aiModel: true, aiContext: true, reviewStatus: true, reviewReason: true, reviewNote: true, reviewedById: true, reviewedAt: true,
        ticket: { select: { id: true, number: true, subject: true, contactName: true, topic: true, aiOutcome: true, handoverReason: true } },
      },
    }),
    ...ENYO_REPLY_FILTERS.map((f) => prisma.supportReply.count({ where: base(f) })),
  ]);
  // The question each reply answered: the sender's latest message before it.
  const questions = await Promise.all(rows.map((r) => prisma.supportReply.findFirst({ where: { ticketId: r.ticket.id, fromCustomer: true, createdAt: { lte: r.createdAt } }, orderBy: { createdAt: 'desc' }, select: { body: true } })));
  const reviewers = [...new Set(rows.map((r) => r.reviewedById).filter((x): x is string => Boolean(x)))];
  const names = new Map((reviewers.length ? await prisma.user.findMany({ where: { id: { in: reviewers } }, select: { id: true, fullName: true } }) : []).map((u) => [u.id, u.fullName]));

  // Measures and the gap report over the period.
  const [tally, tickets] = await Promise.all([
    prisma.supportReply.groupBy({ by: ['kind', 'reviewStatus'], where: { kind: { in: ['AI', 'AI_DRAFT'] }, createdAt: { gte: since }, ticket: reach }, _count: { _all: true } }),
    prisma.supportTicket.findMany({
      where: { AND: [reach, { createdAt: { gte: since } }, { OR: [{ handoverReason: { not: null } }, { replies: { some: { reviewReason: { not: null } } } }] }] },
      take: 3000,
      select: { topic: true, handoverReason: true, aiOutcome: true, replies: { where: { reviewReason: { not: null } }, take: 3, select: { reviewReason: true } } },
    }),
  ]);
  const n = (kind: string, status?: string | null) => tally.filter((t) => t.kind === kind && (status === undefined || t.reviewStatus === status)).reduce((a, t) => a + t._count._all, 0);
  const outcomes = await prisma.supportTicket.groupBy({ by: ['aiOutcome'], where: { AND: [reach, { aiAnsweredAt: { gte: since } }] }, _count: { _all: true } });
  const o = (k: string) => outcomes.find((x) => x.aiOutcome === k)?._count._all ?? 0;
  const measures = enyoMeasures({
    answered: n('AI'), drafted: n('AI_DRAFT'),
    reviewed: n('AI') - n('AI', null), good: n('AI', 'GOOD') + n('AI_DRAFT', 'GOOD'), fixed: n('AI', 'FIXED') + n('AI_DRAFT', 'FIXED'), wrong: n('AI', 'WRONG') + n('AI_DRAFT', 'WRONG'),
    used: n('AI_DRAFT', 'USED'), edited: n('AI_DRAFT', 'EDITED'), ignored: n('AI_DRAFT', 'IGNORED'), confirmed: o('CONFIRMED'), escalated: o('ESCALATED'),
  });
  const { gaps, rightlyHuman } = gapReport(tickets.flatMap((t) => (t.replies.length ? t.replies.map((r) => ({ topic: t.topic, handoverReason: t.handoverReason, reviewReason: r.reviewReason })) : [{ topic: t.topic, handoverReason: t.handoverReason }])));

  return {
    filter, days,
    counts: Object.fromEntries(ENYO_REPLY_FILTERS.map((f, i) => [f, counts[i] ?? 0])) as Record<EnyoReplyFilter, number>,
    measures, gaps, rightlyHuman,
    rows: rows.map((r, i) => {
      const ctx = r.aiContext && typeof r.aiContext === 'object' ? (r.aiContext as Record<string, unknown>) : {};
      const rec = ctx.records && typeof ctx.records === 'object' ? (ctx.records as Record<string, unknown>) : {};
      const records = [...(Array.isArray(rec.jobs) ? rec.jobs : []), ...(Array.isArray(rec.services) ? rec.services : []), ...(Array.isArray(rec.warranties) ? rec.warranties : [])].filter((x): x is string => typeof x === 'string').slice(0, 8);
      return {
        id: r.id, kind: r.kind === 'AI' ? 'AI' : 'AI_DRAFT', body: r.body, createdAt: r.createdAt, confidence: r.aiConfidence, model: r.aiModel,
        ticket: { id: r.ticket.id, number: r.ticket.number, subject: r.ticket.subject, contactName: r.ticket.contactName, topic: r.ticket.topic ? TOPIC_LABEL[asTopic(r.ticket.topic)] : null, outcome: r.ticket.aiOutcome, handover: reasonLabels(r.ticket.handoverReason) },
        question: questions[i]?.body?.slice(0, 1200) ?? null,
        sender: { kind: typeof ctx.kind === 'string' ? ctx.kind : null, proven: typeof ctx.proven === 'boolean' ? ctx.proven : null, records },
        review: {
          status: r.reviewStatus, label: r.reviewStatus ? VERDICT_LABEL[r.reviewStatus] ?? r.reviewStatus : null,
          reason: r.reviewReason, reasonLabel: r.reviewReason ? (FAILURE_LABEL as Record<string, string>)[r.reviewReason] ?? r.reviewReason : null,
          note: r.reviewNote, by: r.reviewedById ? names.get(r.reviewedById) ?? 'A colleague' : null, at: r.reviewedAt,
        },
      };
    }),
  };
}

/**
 * A person's check of one Enyo reply or draft: Good, Corrected (with the
 * right answer) or Wrong, with why. A correction to a general question becomes
 * a candidate answer (names, contacts and record numbers removed) that an
 * administrator approves on the Enyo learning page before Enyo uses it.
 */
export async function reviewEnyoReply(input: { replyId?: string; verdict?: string; reason?: string; note?: string; corrected?: string }): Promise<{ learned: boolean }> {
  await authorize(PERM, undefined, 'reviewEnyoReply');
  const me = await requireUser();
  const reach = (await fenceStaffHelp(ticketReachWhere(await reachWhere(PERM), await myOrganisationId()))) as TicketWhere;
  const verdict = asVerdict(input.verdict);
  if (!verdict) throw new MonitorError('Choose Good, Corrected or Wrong.');
  const reason = verdict === 'GOOD' ? null : asFailureReason(input.reason);
  if (verdict !== 'GOOD' && !reason) throw new MonitorError('Say why it was not right.');
  const note = String(input.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 500) || null;
  const corrected = verdict === 'FIXED' ? cleanReply(input.corrected) : '';
  if (verdict === 'FIXED' && corrected.length < 10) throw new MonitorError('Write the right answer (at least a sentence).');
  if (corrected.length > REPLY_MAX) throw new MonitorError('The answer is too long.');
  const r = typeof input.replyId === 'string' && input.replyId
    ? await prisma.supportReply.findFirst({ where: { id: input.replyId, kind: { in: ['AI', 'AI_DRAFT'] }, ticket: reach }, select: { id: true, ticketId: true, createdAt: true, ticket: { select: { organisationId: true, number: true, topic: true, subject: true, contactName: true, requesterUserId: true } } } })
    : null;
  if (!r) throw new MonitorError(NOT_AVAILABLE);
  await prisma.supportReply.update({ where: { id: r.id }, data: { reviewStatus: verdict, reviewReason: reason, reviewNote: note, reviewedById: me.id, reviewedAt: new Date() } });

  let learned = false;
  const topic = (r.ticket.topic ?? 'other') as Topic;
  if (corrected && !RECORD_TOPICS.includes(topic)) {
    const question = await prisma.supportReply.findFirst({ where: { ticketId: r.ticketId, fromCustomer: true, createdAt: { lte: r.createdAt } }, orderBy: { createdAt: 'desc' }, select: { body: true } });
    const e = extractEntities(`${question?.body ?? ''}\n${corrected}`);
    if (question && !e.plates.length && !e.vins.length && !e.records.length) {
      const staff = await prisma.user.findMany({ where: { organisationId: r.ticket.organisationId }, select: { fullName: true }, take: 2000 }).catch(() => []);
      const names = [r.ticket.contactName, ...staff.map((s) => s.fullName)].filter(Boolean);
      const q = scrubText(`${r.ticket.subject}. ${question.body}`, names).slice(0, 500);
      const a = scrubKeepingLines(corrected, names, 4000);
      const tokens = tokenise(q);
      const before = await prisma.enyoLearnedAnswer.findUnique({ where: { sourceId: `rev:${r.id}` }, select: { status: true } });
      if (tokens.length >= 3 && a && before?.status !== 'REJECTED') {
        const channel = r.ticket.requesterUserId ? 'STAFF' : 'SUPPORT';
        await prisma.enyoLearnedAnswer.upsert({
          where: { sourceId: `rev:${r.id}` },
          create: { organisationId: r.ticket.organisationId, channel, question: q, answer: a, tokens, source: 'review', sourceId: `rev:${r.id}`, createdById: me.id, status: 'PENDING' },
          update: { question: q, answer: a, tokens, status: 'PENDING', approvedById: null, approvedAt: null },
        });
        learned = true;
      }
    }
  }
  await writeAuditLog({ userId: me.id, organisationId: r.ticket.organisationId, action: 'support.ai_reviewed', entityType: 'SupportTicket', entityId: r.ticketId, metadata: { number: r.ticket.number, verdict, ...(reason ? { reason } : {}), learned } });
  return { learned };
}
