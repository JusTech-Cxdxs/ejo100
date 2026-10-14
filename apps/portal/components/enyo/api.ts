'use client';

/**
 * The panel's only door to the server: the three Enyo routes (status, chat
 * stream, refine) and the server actions in lib/actions/enyo.ts. Every call
 * here turns failures into a plain sentence (and a reference when the
 * server gave one); nothing technical reaches the person.
 */
import { readEvents, type EnyoEvent } from '@ejo/enyo/src/protocol';
import type {
  EnyoActionResult,
  EnyoActions,
  EnyoAdminSettings,
  EnyoChatRequest,
  EnyoConnectionTest,
  EnyoConversationDetail,
  EnyoConversationSummary,
  EnyoMemoryFact,
  EnyoRefineResponse,
  EnyoStatus,
  EnyoTone,
} from '@/lib/enyo/client-contract';
import { listEnyoConversations, getEnyoConversation, renameEnyoConversation, deleteEnyoConversation, rateEnyoMessage, listEnyoMemories, deleteEnyoMemory, saveEnyoSettings, testEnyoConnection } from '@/lib/actions/enyo';

// The engine's server actions (lib/actions/enyo.ts), each authorised and fenced to the signed-in person.
const actions: Partial<EnyoActions> = {
  listConversations: listEnyoConversations, getConversation: getEnyoConversation, renameConversation: renameEnyoConversation,
  deleteConversation: deleteEnyoConversation, rateMessage: rateEnyoMessage, listMemories: listEnyoMemories,
  deleteMemory: deleteEnyoMemory, saveEnyoSettings, testEnyoConnection,
} satisfies EnyoActions;

const NOT_AVAILABLE = 'This part of Enyo is not available yet.';
const TRY_AGAIN = 'That did not work. Please try again in a moment.';

// ---------------------------------------------------------------- status

let statusCache: { at: number; value: Promise<EnyoStatus> } | null = null;
const STATUS_TTL = 5 * 60_000;
const OFF: EnyoStatus = { ready: false, reason: 'unavailable', displayName: 'Enyo' };

/** Whether Enyo is on for this person. Shared by every Enyo control on the page; never throws. */
export function getEnyoStatus(force = false): Promise<EnyoStatus> {
  if (!force && statusCache && Date.now() - statusCache.at < STATUS_TTL) return statusCache.value;
  const value = fetch('/api/enyo/status', { credentials: 'same-origin', headers: { accept: 'application/json' }, cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return OFF;
      const body = (await res.json()) as Partial<EnyoStatus>;
      return {
        ready: body.ready === true,
        reason: typeof body.reason === 'string' ? body.reason : undefined,
        displayName: typeof body.displayName === 'string' && body.displayName.trim() ? body.displayName.trim().slice(0, 40) : 'Enyo',
        provider: typeof body.provider === 'string' ? body.provider : undefined,
      };
    })
    .catch(() => OFF);
  statusCache = { at: Date.now(), value };
  return value;
}

// ---------------------------------------------------------------- chat

/** Streams one answer. Yields the server's events; a failed request becomes one `error` event. */
export async function* streamChat(req: EnyoChatRequest, signal: AbortSignal): AsyncGenerator<EnyoEvent> {
  let res: Response;
  try {
    res = await fetch('/api/enyo/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(req),
      signal,
    });
  } catch (e) {
    if (signal.aborted) return;
    void e;
    yield { type: 'error', message: navigator.onLine === false ? 'You seem to be offline. Check the connection and try again.' : TRY_AGAIN };
    return;
  }
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !res.body || !type.includes('text/event-stream')) {
    let message = res.status === 429 ? 'Too many questions in a short time. Please wait a minute and ask again.' : TRY_AGAIN;
    let ref: string | undefined;
    if (type.includes('application/json')) {
      try {
        const body = (await res.json()) as { error?: unknown; message?: unknown; ref?: unknown };
        const text = typeof body.error === 'string' ? body.error : typeof body.message === 'string' ? body.message : '';
        if (text && text.length < 300) message = text;
        if (typeof body.ref === 'string' && /^\w{4,32}$/.test(body.ref)) ref = body.ref;
      } catch { /* keep the plain message */ }
    }
    yield { type: 'error', message, ref };
    return;
  }
  try {
    for await (const ev of readEvents(res.body)) yield ev;
  } catch {
    if (!signal.aborted) yield { type: 'error', message: 'The answer was cut off. Please ask again.' };
  }
}

// ---------------------------------------------------------------- refine

export async function refineText(text: string, tone: EnyoTone): Promise<EnyoRefineResponse> {
  try {
    const res = await fetch('/api/enyo/refine', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ text, tone }),
    });
    const body = (await res.json().catch(() => ({}))) as { text?: unknown; error?: unknown; ref?: unknown };
    if (res.ok && typeof body.text === 'string' && body.text.trim()) return { text: body.text };
    const error = typeof body.error === 'string' && body.error.length < 300 ? body.error : res.status === 429 ? 'Too many requests in a short time. Please wait a minute.' : TRY_AGAIN;
    return { error, ref: typeof body.ref === 'string' ? body.ref : undefined };
  } catch {
    return { error: TRY_AGAIN };
  }
}

// ---------------------------------------------------------------- server actions

export const actionsConnected = (): boolean => typeof actions.listConversations === 'function';

async function call<K extends keyof EnyoActions>(name: K, ...args: Parameters<EnyoActions[K]>): Promise<Awaited<ReturnType<EnyoActions[K]>>> {
  const fn = actions[name] as ((...a: unknown[]) => Promise<Awaited<ReturnType<EnyoActions[K]>>>) | undefined;
  if (!fn) throw new Error(NOT_AVAILABLE);
  return fn(...args);
}

/** Runs a change and always answers with { ok } — a thrown refusal becomes a plain sentence. */
async function change(run: () => Promise<EnyoActionResult | void>): Promise<EnyoActionResult> {
  try {
    const r = await run();
    return r && typeof r === 'object' && 'ok' in r ? r : { ok: true };
  } catch (e) {
    const msg = e instanceof Error && e.message === NOT_AVAILABLE ? NOT_AVAILABLE : TRY_AGAIN;
    return { ok: false, error: msg };
  }
}

export async function loadConversations(): Promise<{ ok: true; items: EnyoConversationSummary[] } | { ok: false; error: string }> {
  try {
    const items = await call('listConversations');
    return { ok: true, items: Array.isArray(items) ? items : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message === NOT_AVAILABLE ? NOT_AVAILABLE : 'Your past chats could not be loaded. Please try again.' };
  }
}

export async function loadConversation(id: string): Promise<EnyoConversationDetail | null> {
  try { return await call('getConversation', id); } catch { return null; }
}

export const renameChat = (id: string, title: string) => change(() => call('renameConversation', id, title));
export const deleteChat = (id: string) => change(() => call('deleteConversation', id));
export const rateAnswer = (messageId: string, rating: 1 | -1, note?: string) => change(() => call('rateMessage', messageId, rating, note));

export async function loadMemories(): Promise<{ ok: true; items: EnyoMemoryFact[] } | { ok: false; error: string }> {
  try {
    const items = await call('listMemories');
    return { ok: true, items: Array.isArray(items) ? items : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message === NOT_AVAILABLE ? NOT_AVAILABLE : 'Your Enyo memory could not be loaded. Please try again.' };
  }
}
export const forgetMemory = (id: string) => change(() => call('deleteMemory', id));

export const saveSettings = (s: EnyoAdminSettings) => change(() => call('saveEnyoSettings', s));
export async function testConnection(): Promise<EnyoConnectionTest> {
  try {
    const r = await call('testEnyoConnection');
    if (r.ok) return r;
    const text = r.error ?? r.message;
    return { ok: false, error: typeof text === 'string' && text.length < 300 ? text : 'The model did not answer. Check the server settings.', ref: r.ref };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message === NOT_AVAILABLE ? NOT_AVAILABLE : 'The test could not run. Please try again.' };
  }
}
