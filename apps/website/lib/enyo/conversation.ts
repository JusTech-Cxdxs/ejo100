/**
 * Website conversations and their messages (enyo_conversations /
 * enyo_messages). A conversation belongs to exactly one customer (CUSTOMER)
 * or one visitor cookie (PUBLIC) of one organisation; an id that is not the
 * caller's own is treated as unknown. Server-only.
 */
import { createHmac } from 'node:crypto';
import { prisma, type Prisma } from '@ejo/database';
import { clip, redactForLog, type AgentResult, type ChatMessage } from '@ejo/enyo';
import type { WebMode } from './types';

export type Owner = { mode: WebMode; organisationId: string; customerId: string | null; visitorKey: string | null };

function ownerWhere(o: Owner): Prisma.EnyoConversationWhereInput {
  return o.mode === 'CUSTOMER'
    ? { organisationId: o.organisationId, channel: 'CUSTOMER', customerId: o.customerId ?? '__none__', archivedAt: null }
    : { organisationId: o.organisationId, channel: 'PUBLIC', visitorKey: o.visitorKey ?? '__none__', archivedAt: null };
}

/** The caller's own conversation with that id, or null (someone else's reads exactly the same). */
export async function ownConversation(o: Owner, id: string | null | undefined): Promise<{ id: string } | null> {
  if (!id) return null;
  return prisma.enyoConversation.findFirst({ where: { id, ...ownerWhere(o) }, select: { id: true } });
}

export async function startConversation(o: Owner, firstMessage: string): Promise<{ id: string }> {
  return prisma.enyoConversation.create({
    data: {
      organisationId: o.organisationId,
      channel: o.mode,
      customerId: o.mode === 'CUSTOMER' ? o.customerId : null,
      visitorKey: o.mode === 'PUBLIC' ? o.visitorKey : null,
      title: clip(firstMessage.replace(/\s+/g, ' ').trim(), 60),
    },
    select: { id: true },
  });
}

/** One-way, keyed hash of the internet address: lets limits work across servers without keeping the address. */
export function ipHash(ip: string | null): string | null {
  if (!ip) return null;
  // A dedicated key when set (ENYO_IP_HASH_KEY); otherwise the site's own secret.
  const key = process.env.ENYO_IP_HASH_KEY || process.env.BETTER_AUTH_SECRET || 'enyo-website-dev-only';
  return createHmac('sha256', key).update(`enyo-ip:${ip}`).digest('hex').slice(0, 32);
}

/** The person's message. For visitors, the hashed address is kept (ipHash) for the per-address limits. */
export async function storeUserMessage(conversationId: string, content: string, hashedIp: string | null): Promise<void> {
  await prisma.enyoMessage.create({
    data: { conversationId, role: 'USER', content, ...(hashedIp ? { ipHash: hashedIp } : {}) },
    select: { id: true },
  });
}

/** Earlier turns, oldest first (text only: tool results are not replayed). */
export async function history(conversationId: string, take = 20): Promise<ChatMessage[]> {
  const rows = await prisma.enyoMessage.findMany({
    where: { conversationId, role: { in: ['USER', 'ASSISTANT'] } },
    orderBy: { createdAt: 'desc' },
    take,
    select: { role: true, content: true },
  });
  return rows.reverse().filter((r) => r.content.trim()).map((r) => (r.role === 'USER' ? { role: 'user' as const, content: r.content } : { role: 'assistant' as const, content: r.content }));
}

/** What the browser shows when a conversation is reopened. */
export async function visibleMessages(conversationId: string): Promise<{ id: string; role: 'user' | 'assistant'; text: string }[]> {
  const rows = await prisma.enyoMessage.findMany({
    where: { conversationId, role: { in: ['USER', 'ASSISTANT'] } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, role: true, content: true },
  });
  return rows.reverse().filter((r) => r.content.trim()).map((r) => ({ id: r.id, role: r.role === 'USER' ? 'user' : 'assistant', text: r.content }));
}

/** The answer, plus a short, redacted note per tool run (never the tool's full result). */
export async function storeAgentResult(conversationId: string, r: AgentResult, latencyMs: number): Promise<string> {
  const tools = r.toolRuns.map((t) => ({ name: t.name, ok: t.ok, refused: t.refused, ms: t.ms }));
  const toolRows = r.transcript.filter((m): m is Extract<ChatMessage, { role: 'tool' }> => m.role === 'tool');
  if (toolRows.length) {
    await prisma.enyoMessage.createMany({
      data: toolRows.slice(0, 10).map((m) => ({ conversationId, role: 'TOOL' as const, toolName: m.name.slice(0, 60), content: clip(redactForLog(m.content), 500) })),
    });
  }
  const msg = await prisma.enyoMessage.create({
    data: {
      conversationId,
      role: 'ASSISTANT',
      content: r.answer.trim() || (r.error ? r.error.message : ''),
      toolCalls: tools.length ? tools : undefined,
      citations: r.sources.length ? { sources: r.sources } : undefined,
      model: r.model.slice(0, 120),
      tokensIn: r.usage.tokensIn,
      tokensOut: r.usage.tokensOut,
      latencyMs,
    },
    select: { id: true },
  });
  await prisma.enyoConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() }, select: { id: true } });
  return msg.id;
}

// ── Rate-limit counts (database, so they hold across server instances) ──

const ago = (ms: number) => new Date(Date.now() - ms);

export async function customerCounts(organisationId: string, customerId: string): Promise<{ perMinute: number }> {
  const perMinute = await prisma.enyoMessage.count({
    where: { role: 'USER', createdAt: { gte: ago(60_000) }, conversation: { organisationId, channel: 'CUSTOMER', customerId } },
  });
  return { perMinute };
}

export async function publicCounts(visitorKey: string, hashedIp: string | null): Promise<{ perMinute: number; perDay: number; ipPerMinute: number; ipPerDay: number }> {
  const byVisitor = (since: Date) => prisma.enyoMessage.count({ where: { role: 'USER', createdAt: { gte: since }, conversation: { channel: 'PUBLIC', visitorKey } } });
  const byIp = (since: Date) => (hashedIp
    ? prisma.enyoMessage.count({ where: { role: 'USER', createdAt: { gte: since }, conversation: { channel: 'PUBLIC' }, ipHash: hashedIp } })
    : Promise.resolve(0));
  const [perMinute, perDay, ipPerMinute, ipPerDay] = await Promise.all([byVisitor(ago(60_000)), byVisitor(ago(86_400_000)), byIp(ago(60_000)), byIp(ago(86_400_000))]);
  return { perMinute, perDay, ipPerMinute, ipPerDay };
}
