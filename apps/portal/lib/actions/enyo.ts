'use server';

import { prisma } from '@ejo/database';
import { complete, LlmError, llmAdminMessage, readLlmConfig, searchProvider, siteOf, webLookup, webLookupEnabled, webSearch } from '@ejo/enyo';
import { requireUser } from './workshop';
import { authorize, currentAssist, getPrincipal, myOrganisationId, refuseDuringAssist } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { logError } from '@/lib/errors';
import { getEnyoSettings, type EnyoSettings } from '@/lib/enyo/settings';
import { learnFromRating } from '@/lib/enyo/learned';

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

function claimedCount(r: { count: number }): void {
  if (!r.count) throw new EnyoError('That learned answer changed just now. Refresh the page and try again.');
}

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
  // A helpful answer to a question that read nobody's records becomes an example Enyo learns from.
  const organisationId = await myOrganisationId();
  if (organisationId) await learnFromRating({ messageId, rating, userId: user.id, organisationId }).catch(() => 'skipped');
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

export type EnyoSettingsInput = Partial<Pick<EnyoSettings, 'enabled' | 'staffAssistant' | 'customerAssistant' | 'publicAssistant' | 'mailAi' | 'predictionsMode' | 'displayName' | 'learnFrom'>>;

const SWITCHES = ['enabled', 'staffAssistant', 'customerAssistant', 'publicAssistant', 'mailAi'] as const;
const MODES = ['SHADOW', 'SUGGEST', 'OFF'] as const;

export async function saveEnyoSettings(input: EnyoSettingsInput): Promise<void> {
  const user = await requireUser();
  await authorize('enyo.manage', undefined, 'saveEnyoSettings', 'Only administrators manage Enyo.');
  await refuseDuringAssist('enyo.settings');
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new EnyoError('This account is not placed in an organisation yet.');
  if (!input || typeof input !== 'object') throw new EnyoError('Nothing to save.');
  const data: Partial<Record<(typeof SWITCHES)[number], boolean>> & { predictionsMode?: string; displayName?: string; learnFrom?: Date | null } = {};
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
  if (input.learnFrom !== undefined) {
    const day = input.learnFrom === null || input.learnFrom === '' ? null : typeof input.learnFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.learnFrom) ? input.learnFrom : 'bad';
    if (day === 'bad') throw new EnyoError('Choose the learn-from day from the calendar, or leave it empty to learn from all history.');
    if (day) {
      const at = new Date(`${day}T00:00:00Z`);
      if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== day) throw new EnyoError('That learn-from day is not a real date.');
      if (day < '2000-01-01') throw new EnyoError('Choose a learn-from day in 2000 or later.');
      if (at.getTime() > Date.now() + 86_400_000) throw new EnyoError('The learn-from day cannot be in the future.');
      data.learnFrom = at;
    } else data.learnFrom = null;
  }
  if (!Object.keys(data).length) throw new EnyoError('Nothing to save.');
  const before = await getEnyoSettings(organisationId);
  await prisma.enyoSetting.upsert({ where: { organisationId }, create: { organisationId, ...data, updatedById: user.id }, update: { ...data, updatedById: user.id } });
  const shown = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);
  const changes = Object.fromEntries(Object.entries(data).filter(([k, v]) => before[k as keyof EnyoSettings] !== shown(v)).map(([k, v]) => [k, { from: before[k as keyof EnyoSettings], to: shown(v) }]));
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
    // Also in Vercel → Logs (search "enyo.test_connection"), with the provider's reason; never the key.
    const ref = logError('enyo.test_connection', err, err instanceof LlmError ? { kind: err.kind, status: err.status, code: err.code, detail: err.detail } : undefined);
    const message = err instanceof LlmError ? llmAdminMessage(err) : `The model server could not be reached: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown error'}.`;
    return { ok: false, message: `${message} (reference ${ref})` };
  }
}

export type WebSearchTestResult = { ok: true; source: string; found: number; sites: string[]; wikipedia: number } | { ok: false; message: string };

/**
 * Searches the web once for the organisation's own name, so an administrator
 * can see Enyo's web look-up works from the server (which engine, how many
 * results, from which sites). Sends only the organisation's name.
 */
export async function testWebSearch(): Promise<WebSearchTestResult> {
  await authorize('enyo.manage', undefined, 'testWebSearch', 'Only administrators manage Enyo.');
  if (!webLookupEnabled()) return { ok: false, message: 'Web look-up is switched off on this installation (ENYO_WEB_LOOKUP=off).' };
  const organisationId = await myOrganisationId();
  const org = organisationId ? await prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true } }) : null;
  const q = org?.name || 'Lagos Nigeria';
  const provider = searchProvider();
  const [g, w] = await Promise.allSettled([provider ? webSearch(q, { provider }) : Promise.resolve(null), webLookup(q)]);
  const general = g.status === 'fulfilled' ? g.value : null;
  const wiki = w.status === 'fulfilled' ? w.value : null;
  if (!general?.pages.length && !wiki?.pages.length) {
    const why = g.status === 'rejected' ? ` ${provider?.label ?? 'The search engine'} did not answer from the server${provider?.name === 'duckduckgo' ? ' (the free engine sometimes refuses servers; a search key in the hosting settings is reliable)' : ''}.` : '';
    return { ok: false, message: `Nothing came back for “${q}”.${why}` };
  }
  return { ok: true, source: general?.pages.length ? general.source : 'Wikipedia', found: (general?.pages.length ?? 0), sites: [...new Set((general?.pages ?? []).map((p) => siteOf(p.url)).filter(Boolean))].slice(0, 5), wikipedia: wiki?.pages.length ?? 0 };
}

// ── What Enyo has learned (administrators) ────────────────────────────

export type LearnedAnswerRow = { id: string; channel: string; question: string; answer: string; source: string; status: string; uses: number; createdAt: Date; lastUsedAt: Date | null; approvedAt: Date | null };

/** The person's own organisation (never "all organisations", even for a super administrator). */
async function learnedOrg(): Promise<string> {
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new EnyoError('This account is not placed in an organisation yet.');
  return organisationId;
}

/** The organisation's learned answers: waiting for approval first, then newest (the Enyo learning page). */
export async function listLearnedAnswers(): Promise<LearnedAnswerRow[]> {
  await authorize('enyo.manage', undefined, 'listLearnedAnswers', 'Only administrators manage Enyo.');
  const organisationId = await myOrganisationId();
  if (!organisationId) return [];
  return prisma.enyoLearnedAnswer.findMany({
    where: { organisationId, status: { in: ['PENDING', 'APPROVED'] } },
    orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    select: { id: true, channel: true, question: true, answer: true, source: true, status: true, uses: true, createdAt: true, lastUsedAt: true, approvedAt: true },
  });
}

/** Approves a learned answer: from now on Enyo follows it and may reuse it for the same question. */
export async function approveLearnedAnswer(id: string): Promise<void> {
  const user = await requireUser();
  await authorize('enyo.manage', undefined, 'approveLearnedAnswer', 'Only administrators manage Enyo.');
  await refuseDuringAssist('enyo.learned.approve');
  const organisationId = await learnedOrg();
  const res = await prisma.enyoLearnedAnswer.updateMany({ where: { id: String(id ?? ''), organisationId, status: 'PENDING' }, data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() } });
  if (!res.count) throw new EnyoError('That learned answer is not waiting for approval.');
  await writeAuditLog({ userId: user.id, action: 'enyo.learned_answer_approved', entityType: 'EnyoLearnedAnswer', entityId: String(id), organisationId });
}

/** Removes a learned answer (it is wrong, out of date, or carries someone's details). */
export async function removeLearnedAnswer(id: string): Promise<void> {
  const user = await requireUser();
  await authorize('enyo.manage', undefined, 'removeLearnedAnswer', 'Only administrators manage Enyo.');
  await refuseDuringAssist('enyo.learned.remove');
  const organisationId = await learnedOrg();
  const row = await prisma.enyoLearnedAnswer.findFirst({ where: { id: String(id ?? ''), organisationId, status: { in: ['PENDING', 'APPROVED'] } }, select: { id: true, organisationId: true } });
  if (!row) throw new EnyoError('That learned answer is not available.');
  // Kept as REJECTED (text cleared) so the same chat or reply is never suggested again.
  claimedCount(await prisma.enyoLearnedAnswer.updateMany({ where: { id: row.id, organisationId, status: { in: ['PENDING', 'APPROVED'] } }, data: { status: 'REJECTED', answer: '', question: '', tokens: [], approvedById: null, approvedAt: null } }));
  await writeAuditLog({ userId: user.id, action: 'enyo.learned_answer_removed', entityType: 'EnyoLearnedAnswer', entityId: row.id, organisationId: row.organisationId });
}
