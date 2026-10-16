import 'server-only';
/**
 * Enyo learns from its conversations — staff (portal), customers (customer
 * portal) and visitors (website) — without ever learning anyone's personal
 * details:
 *
 *  • Insights (Enyo learning page): how much each channel and each role uses
 *    Enyo, what is asked most, which tools are used, how answers are rated,
 *    and the knowledge gaps (answers rated unhelpful, chats that ended with
 *    "a person please").
 *  • Candidates: each day, first questions from customer and website chats
 *    that were answered from the organisation's public information only (no
 *    one's records) and did not end in a hand-over become PENDING learned
 *    answers (scrubbed). An administrator approves before Enyo uses them.
 *  • Training export (JSONL, chat fine-tuning format): only approved learned
 *    answers and helpful-rated first answers that read nobody's records,
 *    scrubbed again; tagged with channel and role, never a name or an id.
 *
 * Organisation-fenced throughout. Conversation text never leaves the
 * organisation's database except in the administrator's own export.
 */
import { prisma } from '@ejo/database';
import { scrubText } from './predict/dataset-core';
import { tokenise } from './predict/text';
import { scrubKeepingLines } from './learned-core';
import { LEARNABLE_TOOLS } from './learned';
import { ROLE_LABELS } from '@/lib/authz/catalogue';

const DAY = 86_400_000;
/** Customer and website tools that read nobody's records. */
const PUBLIC_SAFE_TOOLS = new Set([...LEARNABLE_TOOLS, 'organisation_info']);

export type ConversationInsights = {
  days: number;
  channels: { channel: string; conversations: number; questions: number; people: number }[];
  roles: { role: string; conversations: number }[];
  topWords: { word: string; count: number }[];
  tools: { tool: string; count: number }[];
  ratings: { helpful: number; notHelpful: number };
  handovers: number;
  gaps: { channel: string; question: string; why: string }[];
  learnedPending: number;
  learnedApproved: number;
};

/** Words that say nothing about the topic (on top of the shared stop-words). */
const NOISE = new Set(['pleas', 'thank', 'hello', 'hi', 'good', 'morn', 'afternoon', 'even', 'enyo', 'help', 'want', 'need', 'know', 'tell', 'show', 'can', 'could', 'would']);

export async function conversationInsights(organisationId: string, days = 30): Promise<ConversationInsights> {
  const since = new Date(Date.now() - days * DAY);
  const convs = await prisma.enyoConversation.findMany({
    where: { organisationId, createdAt: { gte: since } },
    take: 5000,
    select: { id: true, channel: true, userId: true, customerId: true, visitorKey: true },
  });
  const ids = convs.map((c) => c.id);
  const [firstQuestions, tools, rated, handovers, pending, approved] = await Promise.all([
    ids.length ? prisma.enyoMessage.findMany({ where: { conversationId: { in: ids }, role: 'USER' }, orderBy: { createdAt: 'asc' }, distinct: ['conversationId'], take: 5000, select: { conversationId: true, content: true } }) : [],
    ids.length ? prisma.enyoMessage.groupBy({ by: ['toolName'], where: { conversationId: { in: ids }, role: 'TOOL' }, _count: { _all: true } }) : [],
    ids.length ? prisma.enyoMessage.findMany({ where: { conversationId: { in: ids }, role: 'ASSISTANT', rating: { not: null } }, take: 2000, select: { rating: true, ratingNote: true, conversationId: true, createdAt: true } }) : [],
    prisma.supportTicket.findMany({ where: { organisationId, createdAt: { gte: since }, conversationId: { not: null } }, take: 500, select: { conversationId: true, subject: true } }),
    prisma.enyoLearnedAnswer.count({ where: { organisationId, status: 'PENDING' } }),
    prisma.enyoLearnedAnswer.count({ where: { organisationId, status: 'APPROVED' } }),
  ]);
  const byChannel = new Map<string, { conversations: number; questions: number; people: Set<string> }>();
  for (const c of convs) {
    const e = byChannel.get(c.channel) ?? { conversations: 0, questions: 0, people: new Set<string>() };
    e.conversations += 1;
    const who = c.userId ?? c.customerId ?? c.visitorKey;
    if (who) e.people.add(who);
    byChannel.set(c.channel, e);
  }
  const questionCounts = ids.length ? await prisma.enyoMessage.groupBy({ by: ['conversationId'], where: { conversationId: { in: ids }, role: 'USER' }, _count: { _all: true } }) : [];
  const channelOf = new Map(convs.map((c) => [c.id, c.channel]));
  for (const q of questionCounts) { const e = byChannel.get(channelOf.get(q.conversationId) ?? ''); if (e) e.questions += q._count._all; }

  // Staff conversations per role (role labels only, never names).
  const staffUsers = [...new Set(convs.filter((c) => c.channel === 'STAFF' && c.userId).map((c) => c.userId!))];
  const roles = staffUsers.length ? await prisma.userRole.findMany({ where: { userId: { in: staffUsers } }, select: { userId: true, role: { select: { slug: true, name: true } } } }) : [];
  const roleOf = new Map<string, string[]>();
  for (const r of roles) roleOf.set(r.userId, [...(roleOf.get(r.userId) ?? []), ROLE_LABELS[r.role.slug] ?? r.role.name]);
  const roleCounts = new Map<string, number>();
  for (const c of convs) if (c.channel === 'STAFF' && c.userId) for (const label of roleOf.get(c.userId) ?? ['No role']) roleCounts.set(label, (roleCounts.get(label) ?? 0) + 1);

  // What is asked most: word counts over first questions (scrubbed, stemmed).
  const words = new Map<string, number>();
  for (const q of firstQuestions) for (const w of new Set(tokenise(scrubText(q.content)))) if (!NOISE.has(w) && w.length > 2) words.set(w, (words.get(w) ?? 0) + 1);

  // Knowledge gaps: answers rated unhelpful, and chats that ended in a hand-over.
  const firstQ = new Map(firstQuestions.map((q) => [q.conversationId, q.content]));
  const gaps = [
    ...rated.filter((r) => r.rating === -1).slice(0, 12).map((r) => ({ channel: channelOf.get(r.conversationId) ?? 'STAFF', question: scrubText(firstQ.get(r.conversationId) ?? '').slice(0, 160), why: r.ratingNote ? `Rated unhelpful: ${scrubText(r.ratingNote).slice(0, 100)}` : 'Rated unhelpful' })),
    ...handovers.slice(0, 12).map((h) => ({ channel: channelOf.get(h.conversationId ?? '') ?? 'CUSTOMER', question: scrubText(firstQ.get(h.conversationId ?? '') ?? h.subject).slice(0, 160), why: 'Asked for a person' })),
  ].filter((g) => g.question.trim()).slice(0, 20);

  return {
    days,
    channels: [...byChannel.entries()].map(([channel, e]) => ({ channel, conversations: e.conversations, questions: e.questions, people: e.people.size })).sort((a, b) => b.conversations - a.conversations),
    roles: [...roleCounts.entries()].map(([role, n]) => ({ role, conversations: n })).sort((a, b) => b.conversations - a.conversations).slice(0, 12),
    topWords: [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([word, count]) => ({ word, count })),
    tools: tools.filter((t) => t.toolName).map((t) => ({ tool: t.toolName!, count: t._count._all })).sort((a, b) => b.count - a.count).slice(0, 15),
    ratings: { helpful: rated.filter((r) => r.rating === 1).length, notHelpful: rated.filter((r) => r.rating === -1).length },
    handovers: handovers.length,
    gaps,
    learnedPending: pending,
    learnedApproved: approved,
  };
}

/**
 * Yesterday's customer and website chats → PENDING learned answers (at most
 * 20 per organisation per day): the first question and Enyo's first answer,
 * when the answer used no tool or only the organisation's public details,
 * and the chat did not end in a hand-over. Scrubbed; approved by a person.
 */
export async function harvestPublicConversations(organisationId: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 2 * DAY);
  const until = new Date(now.getTime() - 3 * 3_600_000);
  const convs = await prisma.enyoConversation.findMany({
    where: { organisationId, channel: { in: ['CUSTOMER', 'PUBLIC'] }, createdAt: { gte: since, lte: until } },
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: { id: true, channel: true, messages: { orderBy: { createdAt: 'asc' }, take: 6, select: { id: true, role: true, content: true, toolName: true } } },
  });
  const handedOver = new Set((await prisma.supportTicket.findMany({ where: { organisationId, conversationId: { in: convs.map((c) => c.id) } }, select: { conversationId: true } })).map((t) => t.conversationId));
  const staff = (await prisma.user.findMany({ where: { organisationId }, select: { fullName: true }, take: 2000 })).map((u) => u.fullName);
  let made = 0;
  for (const c of convs) {
    if (made >= 20) break;
    if (handedOver.has(c.id)) continue;
    const q = c.messages.find((m) => m.role === 'USER');
    const qi = c.messages.indexOf(q!);
    const a = c.messages.slice(qi + 1).find((m) => m.role === 'ASSISTANT');
    if (!q || !a) continue;
    const between = c.messages.slice(qi + 1, c.messages.indexOf(a));
    if (between.some((m) => m.role === 'TOOL' && !PUBLIC_SAFE_TOOLS.has(m.toolName ?? ''))) continue;
    if (between.some((m) => m.role === 'USER')) continue;
    const question = scrubText(q.content, staff).slice(0, 500);
    const answer = scrubKeepingLines(a.content, staff, 4000);
    const tokens = tokenise(question);
    if (tokens.length < 3 || answer.length < 20) continue;
    // Customer chats read the customer's own records: only questions that are clearly general are taken.
    if (c.channel === 'CUSTOMER' && /\b(my|mine|i|me)\b/i.test(q.content)) continue;
    const r = await prisma.enyoLearnedAnswer.upsert({
      where: { sourceId: `chat:${a.id}` },
      create: { organisationId, channel: c.channel, question, answer, tokens, source: 'chat', sourceId: `chat:${a.id}`, status: 'PENDING' },
      update: {},
      select: { createdAt: true },
    });
    if (now.getTime() - r.createdAt.getTime() < 60_000) made += 1;
  }
  return made;
}

export type TrainingExample = { messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; meta: { channel: string; source: string; role?: string } };

/** The fine-tuning set: approved answers, and first answers people rated helpful that read nobody's records. Scrubbed again. */
export async function conversationTrainingSet(organisationId: string): Promise<{ rows: TrainingExample[]; report: { approved: number; rated: number } }> {
  const [org, approved, staff] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true } }),
    prisma.enyoLearnedAnswer.findMany({ where: { organisationId, status: 'APPROVED' }, orderBy: { createdAt: 'asc' }, take: 5000, select: { channel: true, question: true, answer: true, source: true } }),
    prisma.user.findMany({ where: { organisationId }, select: { fullName: true }, take: 2000 }),
  ]);
  const names = staff.map((s) => s.fullName);
  const system = (channel: string) => `You are Enyo, the assistant of ${org?.name ?? 'the organisation'} (channel: ${channel.toLowerCase()}). Answer accurately from what you are allowed to see, briefly and kindly.`;
  const rows: TrainingExample[] = approved.map((a) => ({
    messages: [{ role: 'system', content: system(a.channel) }, { role: 'user', content: scrubText(a.question, names) }, { role: 'assistant', content: scrubKeepingLines(a.answer, names, 4000) }],
    meta: { channel: a.channel, source: `approved:${a.source}` },
  }));
  // Helpful-rated first answers in staff chats that read nobody's records (not already approved above).
  const helpful = await prisma.enyoMessage.findMany({
    where: { role: 'ASSISTANT', rating: 1, conversation: { organisationId } },
    orderBy: { createdAt: 'desc' },
    take: 1000,
    select: { id: true, content: true, conversationId: true, createdAt: true, conversation: { select: { channel: true, userId: true } } },
  });
  const learnedIds = new Set((await prisma.enyoLearnedAnswer.findMany({ where: { organisationId, sourceId: { in: helpful.map((h) => `msg:${h.id}`) } }, select: { sourceId: true } })).map((x) => x.sourceId));
  const roleOf = new Map<string, string>();
  const users = [...new Set(helpful.map((h) => h.conversation.userId).filter((x): x is string => Boolean(x)))];
  for (const r of users.length ? await prisma.userRole.findMany({ where: { userId: { in: users } }, select: { userId: true, role: { select: { slug: true } } } }) : []) if (!roleOf.has(r.userId)) roleOf.set(r.userId, ROLE_LABELS[r.role.slug] ?? r.role.slug);
  let rated = 0;
  for (const h of helpful) {
    if (learnedIds.has(`msg:${h.id}`)) continue;
    const before = await prisma.enyoMessage.findMany({ where: { conversationId: h.conversationId, createdAt: { lte: h.createdAt } }, orderBy: { createdAt: 'asc' }, take: 12, select: { role: true, content: true, toolName: true } });
    const users2 = before.filter((m) => m.role === 'USER');
    if (users2.length !== 1) continue;
    if (before.some((m) => m.role === 'TOOL' && !LEARNABLE_TOOLS.has(m.toolName ?? ''))) continue;
    rows.push({
      messages: [{ role: 'system', content: system(h.conversation.channel) }, { role: 'user', content: scrubText(users2[0]!.content, names) }, { role: 'assistant', content: scrubKeepingLines(h.content, names, 4000) }],
      meta: { channel: h.conversation.channel, source: 'rated_helpful', ...(h.conversation.userId && roleOf.get(h.conversation.userId) ? { role: roleOf.get(h.conversation.userId)! } : {}) },
    });
    rated += 1;
  }
  return { rows, report: { approved: approved.length, rated } };
}
