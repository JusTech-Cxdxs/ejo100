'use server';

import { prisma } from '@ejo/database';
import { complete, LlmError, llmAdminMessage, readLlmConfig } from '@ejo/enyo';
import { requireUser } from './workshop';
import { authorize, currentAssist, getPrincipal, myOrganisationId, refuseDuringAssist } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { getEnyoSettings, type EnyoSettings } from '@/lib/enyo/settings';

/**
 * Enyo for the signed-in person: their own conversations (list, open, rename,
 * delete), rating answers, their remembered facts, and — for administrators
 * with enyo.manage — the organisation's Enyo settings and a connection test.
 *
 * Every conversation and fact is looked up by the person's own user id AND
 * organisation, so nobody can open, rename, rate or delete another person's.
 * During an assisted session only the conversations started in that session
 * are listed (the colleague's earlier chats stay private), and deleting,
 * memory and settings refuse.
 */

class EnyoError extends Error {}

const NOT_FOUND = 'That conversation is not available.';

/**
 * The organisation fence for the person's own chats and facts: the SAME
 * organisation the chat route stores them under (myOrganisationId), so a
 * person whose account resolves the organisation from their branch still
 * finds their own chats. The platform team: any organisation (their own user id still fences).
 */
async function myEnyoOrg(): Promise<{ organisationId?: string }> {
  if ((await getPrincipal()).isSuperAdmin) return {};
  return { organisationId: (await myOrganisationId()) ?? '__no_organisation__' };
}

/** Conversations started during the current assisted session only (none of the colleague's earlier ones). */
async function assistWindow(): Promise<{ createdAt?: { gte: Date } }> {
  const a = await currentAssist();
  return a ? { createdAt: { gte: a.startedAt } } : {};
}

export type EnyoConversationSummary = { id: string; title: string; updatedAt: Date };

export async function listEnyoConversations(): Promise<EnyoConversationSummary[]> {
  const user = await requireUser();
  const rows = await prisma.enyoConversation.findMany({
    where: { userId: user.id, channel: 'STAFF', archivedAt: null, ...(await myEnyoOrg()), ...(await assistWindow()) },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: { id: true, title: true, updatedAt: true },
  });
  return rows.map((r) => ({ id: r.id, title: r.title || 'New conversation', updatedAt: r.updatedAt }));
}

export type EnyoStoredMessage = { id: string; role: 'USER' | 'ASSISTANT'; content: string; createdAt: Date; rating: number | null; sources: { label: string; href?: string }[] };

export async function getEnyoConversation(conversationId: string): Promise<{ id: string; title: string; messages: EnyoStoredMessage[] } | null> {
  const user = await requireUser();
  if (typeof conversationId !== 'string' || !conversationId) return null;
  const c = await prisma.enyoConversation.findFirst({
    where: { id: conversationId, userId: user.id, channel: 'STAFF', archivedAt: null, ...(await myEnyoOrg()), ...(await assistWindow()) },
    select: {
      id: true, title: true,
      messages: { where: { role: { in: ['USER', 'ASSISTANT'] } }, orderBy: { createdAt: 'asc' }, take: 200, select: { id: true, role: true, content: true, createdAt: true, rating: true, citations: true } },
    },
  });
  if (!c) return null;
  return {
    id: c.id,
    title: c.title || 'New conversation',
    messages: c.messages
      .filter((m) => m.role === 'USER' || m.content.trim())
      .map((m) => ({
        id: m.id, role: m.role as 'USER' | 'ASSISTANT', content: m.content, createdAt: m.createdAt, rating: m.rating,
        sources: Array.isArray((m.citations as { sources?: unknown } | null)?.sources) ? ((m.citations as { sources: { label: string; href?: string }[] }).sources) : [],
      })),
  };
}

export async function renameEnyoConversation(conversationId: string, title: string): Promise<void> {
  const user = await requireUser();
  const clean = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : '';
  if (!clean) throw new EnyoError('Give the conversation a name.');
  if (clean.length > 80) throw new EnyoError('Keep the name to 80 characters or fewer.');
  const res = await prisma.enyoConversation.updateMany({
    where: { id: conversationId, userId: user.id, channel: 'STAFF', archivedAt: null, ...(await myEnyoOrg()), ...(await assistWindow()) },
    data: { title: clean },
  });
  if (!res.count) throw new EnyoError(NOT_FOUND);
}

/** Deleting hides the conversation at once; the retention job removes it for good. */
export async function deleteEnyoConversation(conversationId: string): Promise<void> {
  const user = await requireUser();
  await refuseDuringAssist('enyo.conversation.delete');
  const res = await prisma.enyoConversation.updateMany({
    where: { id: conversationId, userId: user.id, channel: 'STAFF', archivedAt: null, ...(await myEnyoOrg()) },
    data: { archivedAt: new Date() },
  });
  if (!res.count) throw new EnyoError(NOT_FOUND);
}

/** +1 helpful, -1 not helpful, 0 clears; an optional note (max 500 characters). Only Enyo's answers in the person's own conversations. */
export async function rateEnyoMessage(messageId: string, rating: number, note?: string): Promise<void> {
  const user = await requireUser();
  if (rating !== 1 && rating !== -1 && rating !== 0) throw new EnyoError('Choose helpful or not helpful.');
  const cleanNote = typeof note === 'string' ? note.replace(/\s+/g, ' ').trim().slice(0, 500) : '';
  const res = await prisma.enyoMessage.updateMany({
    where: { id: messageId, role: 'ASSISTANT', conversation: { userId: user.id, channel: 'STAFF', ...(await myEnyoOrg()), ...(await assistWindow()) } },
    data: { rating: rating === 0 ? null : rating, ratingNote: rating === 0 ? null : cleanNote || null },
  });
  if (!res.count) throw new EnyoError('That answer is not available.');
}

export type EnyoMemoryFact = { id: string; fact: string; createdAt: Date };

/** The facts Enyo remembers for this person (none are shown during an assisted session). */
export async function listEnyoMemories(): Promise<EnyoMemoryFact[]> {
  const user = await requireUser();
  if (await currentAssist()) return [];
  return prisma.enyoMemory.findMany({ where: { userId: user.id, ...(await myEnyoOrg()) }, orderBy: { createdAt: 'asc' }, take: 50, select: { id: true, fact: true, createdAt: true } });
}

export async function deleteEnyoMemory(memoryId: string): Promise<void> {
  const user = await requireUser();
  await refuseDuringAssist('enyo.memory.delete');
  const res = await prisma.enyoMemory.deleteMany({ where: { id: memoryId, userId: user.id, ...(await myEnyoOrg()) } });
  if (!res.count) throw new EnyoError('That fact is not available.');
}

// ── Settings (administrators) ─────────────────────────────────────────

export type EnyoAdminSettings = EnyoSettings & { configured: boolean; provider: string | null; model: string | null };

export async function getEnyoAdminSettings(): Promise<EnyoAdminSettings> {
  await authorize('enyo.manage', undefined, 'getEnyoAdminSettings', 'Only administrators manage Enyo.');
  const settings = await getEnyoSettings(await myOrganisationId());
  const config = readLlmConfig();
  return { ...settings, configured: Boolean(config), provider: config?.providerLabel ?? null, model: config?.model ?? null };
}

export type EnyoSettingsInput = Partial<Pick<EnyoSettings, 'enabled' | 'staffAssistant' | 'customerAssistant' | 'publicAssistant' | 'mailAi' | 'predictionsMode' | 'displayName'>>;

const SWITCHES = ['enabled', 'staffAssistant', 'customerAssistant', 'publicAssistant', 'mailAi'] as const;
const MODES = ['SHADOW', 'SUGGEST', 'OFF'] as const;

export async function saveEnyoSettings(input: EnyoSettingsInput): Promise<void> {
  const user = await requireUser();
  await authorize('enyo.manage', undefined, 'saveEnyoSettings', 'Only administrators manage Enyo.');
  await refuseDuringAssist('enyo.settings');
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new EnyoError('This account is not placed in an organisation yet.');
  if (!input || typeof input !== 'object') throw new EnyoError('Nothing to save.');
  const data: Partial<Record<(typeof SWITCHES)[number], boolean>> & { predictionsMode?: string; displayName?: string } = {};
  for (const k of SWITCHES) {
    if (input[k] === undefined) continue;
    if (typeof input[k] !== 'boolean') throw new EnyoError('Each switch must be on or off.');
    data[k] = input[k] as boolean;
  }
  if (input.predictionsMode !== undefined) {
    if (!(MODES as readonly string[]).includes(input.predictionsMode)) throw new EnyoError('Choose how predictions are used: measured only, shown as suggestions, or off.');
    data.predictionsMode = input.predictionsMode;
  }
  if (input.displayName !== undefined) {
    const name = typeof input.displayName === 'string' ? input.displayName.replace(/\s+/g, ' ').trim() : '';
    if (!name) throw new EnyoError('Give the assistant a display name.');
    if (name.length > 30) throw new EnyoError('Keep the display name to 30 characters or fewer.');
    if (/[<>{}]/.test(name)) throw new EnyoError('Use letters, numbers and simple punctuation in the display name.');
    data.displayName = name;
  }
  if (!Object.keys(data).length) throw new EnyoError('Nothing to save.');
  const before = await getEnyoSettings(organisationId);
  await prisma.enyoSetting.upsert({ where: { organisationId }, create: { organisationId, ...data, updatedById: user.id }, update: { ...data, updatedById: user.id } });
  const changes = Object.fromEntries(Object.entries(data).filter(([k, v]) => before[k as keyof EnyoSettings] !== v).map(([k, v]) => [k, { from: before[k as keyof EnyoSettings], to: v }]));
  if (Object.keys(changes).length) {
    await writeAuditLog({ userId: user.id, action: 'enyo.settings_changed', entityType: 'EnyoSetting', entityId: organisationId, organisationId, metadata: { changes } });
  }
}

export type EnyoConnectionResult = { ok: true; latencyMs: number; model: string; provider: string } | { ok: false; message: string };

/** A tiny request to the model server, so an administrator can see it answers. */
export async function testEnyoConnection(): Promise<EnyoConnectionResult> {
  await authorize('enyo.manage', undefined, 'testEnyoConnection', 'Only administrators manage Enyo.');
  const config = readLlmConfig();
  if (!config) return { ok: false, message: 'No model server is set up for this installation yet. JusTech sets it in the server environment.' };
  const started = Date.now();
  try {
    const res = await complete({ ...config, timeoutMs: Math.min(config.timeoutMs, 20_000) }, { messages: [{ role: 'system', content: 'Reply with the single word OK.' }, { role: 'user', content: 'Are you there?' }], maxTokens: 5, temperature: 0 });
    return { ok: true, latencyMs: Date.now() - started, model: res.model, provider: config.providerLabel };
  } catch (err) {
    return { ok: false, message: err instanceof LlmError ? llmAdminMessage(err) : 'The model server could not be reached.' };
  }
}
