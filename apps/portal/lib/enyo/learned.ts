import 'server-only';
/**
 * What Enyo learns from people (v35, EnyoLearnedAnswer):
 *
 *  • An answer someone marks helpful becomes a CANDIDATE — only when it was
 *    the first question of a chat (nothing earlier to lean on), Enyo used no
 *    remembered facts about the person, read nobody's records (no tools, or
 *    only the guide and the public web), and was not itself a reused answer.
 *    Names, phones, emails, plates and links are removed.
 *  • An administrator approves a candidate (Settings → Enyo → Learning)
 *    before Enyo ever uses it: one person's thumbs-up cannot plant an answer.
 *  • Replies colleagues write to questions Enyo handed over (support) are
 *    added the same way (lib/support, later).
 *  • Next time, the closest APPROVED examples are given to the model as
 *    patterns of a good answer; a near-identical general question is answered
 *    straight from the example, with no model call (cheaper and instant).
 *
 * Organisation-fenced: one organisation never learns from another.
 */
import { prisma } from '@ejo/database';
import { scrubText } from './predict/dataset-core';
import { tokenise } from './predict/text';
import { learnedMatches, scrubKeepingLines, type LearnedRow } from './learned-core';

/** Tools that read no one's records: an answer that used only these may be learned. */
export const LEARNABLE_TOOLS = new Set(['guide_search', 'web_lookup', 'organisation_info']);

/**
 * An answer marked helpful (rating 1) becomes a candidate for approval; any
 * other rating removes it. A "not helpful" on an answer that was itself reused
 * from a learned one sends that learned answer back for review.
 */
export async function learnFromRating(o: { messageId: string; rating: number; userId: string; organisationId: string }): Promise<'learned' | 'removed' | 'flagged' | 'skipped'> {
  const answer = await prisma.enyoMessage.findFirst({
    where: { id: o.messageId, role: 'ASSISTANT', conversation: { userId: o.userId, organisationId: o.organisationId } },
    select: { content: true, createdAt: true, conversationId: true, citations: true, model: true, conversation: { select: { channel: true } } },
  });
  const learnedFrom = answer?.citations && typeof answer.citations === 'object' && !Array.isArray(answer.citations) ? (answer.citations as Record<string, unknown>).learnedFrom : undefined;
  if (o.rating !== 1) {
    if (o.rating === -1 && typeof learnedFrom === 'string') {
      const r = await prisma.enyoLearnedAnswer.updateMany({ where: { id: learnedFrom, organisationId: o.organisationId }, data: { status: 'PENDING', approvedById: null, approvedAt: null } });
      if (r.count) return 'flagged';
    }
    const r = await prisma.enyoLearnedAnswer.deleteMany({ where: { sourceId: `msg:${o.messageId}`, organisationId: o.organisationId } });
    return r.count ? 'removed' : 'skipped';
  }
  // Never learn from a reused answer (it would only copy itself).
  if (!answer?.content.trim() || learnedFrom !== undefined || answer.model === 'learned') return 'skipped';
  // Only the first question of a chat: no earlier turns it might lean on.
  const users = await prisma.enyoMessage.findMany({
    where: { conversationId: answer.conversationId, role: 'USER', createdAt: { lte: answer.createdAt } },
    orderBy: { createdAt: 'asc' },
    take: 2,
    select: { content: true, createdAt: true },
  });
  const earlierAnswers = await prisma.enyoMessage.count({ where: { conversationId: answer.conversationId, role: 'ASSISTANT', createdAt: { lt: answer.createdAt } } });
  if (users.length !== 1 || earlierAnswers > 0) return 'skipped';
  const question = users[0]!;
  if (!question.content.trim()) return 'skipped';
  // Enyo remembered facts about this person: the answer may carry them.
  const memories = await prisma.enyoMemory.count({ where: { userId: o.userId, organisationId: o.organisationId, createdAt: { lte: answer.createdAt } } });
  if (memories > 0) return 'skipped';
  const tools = await prisma.enyoMessage.findMany({
    where: { conversationId: answer.conversationId, role: 'TOOL', createdAt: { gte: question.createdAt, lte: answer.createdAt } },
    select: { toolName: true },
  });
  if (tools.some((t) => !LEARNABLE_TOOLS.has(t.toolName ?? ''))) return 'skipped';
  const names = await peopleNames(o.organisationId, o.userId);
  const q = scrubText(question.content, names).slice(0, 500);
  const a = scrubKeepingLines(answer.content, names, 4000);
  const tokens = tokenise(q);
  if (tokens.length < 2 || !a) return 'skipped';
  await prisma.enyoLearnedAnswer.upsert({
    where: { sourceId: `msg:${o.messageId}` },
    create: { organisationId: o.organisationId, channel: answer.conversation.channel, question: q, answer: a, tokens, source: 'rating', sourceId: `msg:${o.messageId}`, createdById: o.userId, status: 'PENDING' },
    update: { question: q, answer: a, tokens },
  });
  return 'learned';
}

/** The rater's name and the organisation's staff names, so none survive into a learned answer. */
async function peopleNames(organisationId: string, userId: string): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { OR: [{ id: userId }, { organisationId }] },
    select: { fullName: true },
    take: 2000,
  }).catch(() => [] as { fullName: string | null }[]);
  return rows.map((r) => r.fullName ?? '').filter(Boolean);
}

/** The closest learned answers for a question in this organisation and channel. */
export async function findLearned(organisationId: string, channels: string[], question: string, limit = 2): Promise<(LearnedRow & { score: number })[]> {
  const rows = await prisma.enyoLearnedAnswer.findMany({
    where: { organisationId, channel: { in: channels }, status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    take: 400,
    select: { id: true, question: true, answer: true, tokens: true, createdAt: true },
  }).catch(() => []);
  return learnedMatches(rows.map((r) => ({ ...r, tokens: Array.isArray(r.tokens) ? (r.tokens as string[]) : [] })), tokenise(question), limit);
}

export async function noteLearnedUse(id: string): Promise<void> {
  await prisma.enyoLearnedAnswer.update({ where: { id }, data: { uses: { increment: 1 }, lastUsedAt: new Date() } }).catch(() => undefined);
}

