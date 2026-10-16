import 'server-only';
/**
 * What Enyo learns from people (v35, EnyoLearnedAnswer):
 *
 *  • An answer someone marks helpful becomes a worked example — only when the
 *    question read nobody's records (no tools, or only the guide and the
 *    public web), with names, phones, emails, plates and links removed.
 *  • Replies colleagues write to questions Enyo handed over (support) are
 *    added the same way (lib/support, later).
 *  • Next time, the closest examples are given to the model as patterns of a
 *    good answer; a near-identical question is answered straight from the
 *    example, with no model call at all (cheaper and instant).
 *
 * Organisation-fenced: one organisation never learns from another.
 */
import { prisma } from '@ejo/database';
import { scrubText } from './predict/dataset-core';
import { tokenise } from './predict/text';
import { learnedMatches, type LearnedRow } from './learned-core';

/** Tools that read no one's records: an answer that used only these may be learned. */
export const LEARNABLE_TOOLS = new Set(['guide_search', 'web_lookup', 'organisation_info']);

/** An answer marked helpful (rating 1) becomes an example; any other rating removes it. */
export async function learnFromRating(o: { messageId: string; rating: number; userId: string; organisationId: string }): Promise<'learned' | 'removed' | 'skipped'> {
  if (o.rating !== 1) {
    const r = await prisma.enyoLearnedAnswer.deleteMany({ where: { sourceId: `msg:${o.messageId}`, organisationId: o.organisationId } });
    return r.count ? 'removed' : 'skipped';
  }
  const answer = await prisma.enyoMessage.findFirst({
    where: { id: o.messageId, role: 'ASSISTANT', conversation: { userId: o.userId, organisationId: o.organisationId } },
    select: { content: true, createdAt: true, conversationId: true, conversation: { select: { channel: true } } },
  });
  if (!answer?.content.trim()) return 'skipped';
  const question = await prisma.enyoMessage.findFirst({
    where: { conversationId: answer.conversationId, role: 'USER', createdAt: { lt: answer.createdAt } },
    orderBy: { createdAt: 'desc' },
    select: { content: true, createdAt: true },
  });
  if (!question?.content.trim()) return 'skipped';
  const tools = await prisma.enyoMessage.findMany({
    where: { conversationId: answer.conversationId, role: 'TOOL', createdAt: { gt: question.createdAt, lt: answer.createdAt } },
    select: { toolName: true },
  });
  if (tools.some((t) => !LEARNABLE_TOOLS.has(t.toolName ?? ''))) return 'skipped';
  const user = await prisma.user.findUnique({ where: { id: o.userId }, select: { fullName: true } });
  const names = user?.fullName ? [user.fullName] : [];
  const q = scrubText(question.content, names).slice(0, 500);
  const a = scrubText(answer.content, names).slice(0, 3000);
  const tokens = tokenise(q);
  if (tokens.length < 2) return 'skipped';
  await prisma.enyoLearnedAnswer.upsert({
    where: { sourceId: `msg:${o.messageId}` },
    create: { organisationId: o.organisationId, channel: answer.conversation.channel, question: q, answer: a, tokens, source: 'rating', sourceId: `msg:${o.messageId}`, createdById: o.userId },
    update: { question: q, answer: a, tokens },
  });
  return 'learned';
}

/** The closest learned answers for a question in this organisation and channel. */
export async function findLearned(organisationId: string, channels: string[], question: string, limit = 2): Promise<(LearnedRow & { score: number })[]> {
  const rows = await prisma.enyoLearnedAnswer.findMany({
    where: { organisationId, channel: { in: channels } },
    orderBy: { createdAt: 'desc' },
    take: 400,
    select: { id: true, question: true, answer: true, tokens: true, createdAt: true },
  }).catch(() => []);
  return learnedMatches(rows.map((r) => ({ ...r, tokens: Array.isArray(r.tokens) ? (r.tokens as string[]) : [] })), tokenise(question), limit);
}

export async function noteLearnedUse(id: string): Promise<void> {
  await prisma.enyoLearnedAnswer.update({ where: { id }, data: { uses: { increment: 1 }, lastUsedAt: new Date() } }).catch(() => undefined);
}

