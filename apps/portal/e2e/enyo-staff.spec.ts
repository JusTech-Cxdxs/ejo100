/**
 * Enyo, the staff assistant — end to end against the stand-in model server
 * (packages/enyo/testing/mock-llm.mjs). The chat panel is built separately,
 * so these tests drive POST /api/enyo/chat directly with the signed-in
 * browser's own session and read the Server-Sent Events it streams.
 *
 * The mock follows markers: "[[say:…]]" answers exactly that; "[[tool:name {json}]]"
 * calls that tool (when offered) and then answers "Here is what I found: <tool result>",
 * so a refusal or a figure is visible in the answer text.
 */
import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { as } from './helpers';
import { db } from './db';
import { SEED_PARTS } from './people';

type Event = { type: string; [k: string]: unknown };

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const LIMIT = Number(process.env.ENYO_REQUESTS_PER_MINUTE || 20);

function parseEvents(body: string): Event[] {
  const out: Event[] = [];
  for (const block of body.split('\n\n')) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      try { out.push(JSON.parse(line.slice(5).trim()) as Event); } catch { /* skipped, as the panel does */ }
    }
  }
  return out;
}

async function ask(page: Page, message: string, extra: Record<string, unknown> = {}, origin = BASE): Promise<{ res: APIResponse; events: Event[]; text: string }> {
  const res = await page.request.post('/api/enyo/chat', { data: { message, ...extra }, headers: { origin }, maxRedirects: 0, timeout: 60_000 });
  const body = await res.text();
  const events = parseEvents(body);
  const text = events.filter((e) => e.type === 'text').map((e) => String(e.text)).join('');
  return { res, events, text };
}

const tool = (events: Event[], name: string) => events.find((e) => e.type === 'tool' && e.name === name);
const conversationOf = (events: Event[]) => String(events.find((e) => e.type === 'conversation')?.id ?? '');

/** The stored tool result for the newest call of `name` in a conversation (clipped and redacted, as kept). */
async function storedToolResult(conversationId: string, name: string): Promise<string> {
  const row = await db().enyoMessage.findFirst({ where: { conversationId, role: 'TOOL', toolName: name }, orderBy: { createdAt: 'desc' }, select: { content: true } });
  return row?.content ?? '';
}

test.describe('Enyo staff assistant (API)', () => {
  test('streams an answer: conversation first, then the text, then done — and keeps the conversation', async ({ page }) => {
    await as(page, 'receptionist');
    const status = await page.request.get('/api/enyo/status');
    expect(status.status()).toBe(200);
    expect(await status.json()).toMatchObject({ ready: true, displayName: expect.any(String) });

    const first = await ask(page, '[[say:Good morning, how can I help?]]');
    expect(first.res.status()).toBe(200);
    expect(first.res.headers()['content-type']).toContain('text/event-stream');
    expect(first.events[0]?.type).toBe('conversation');
    expect(first.text).toBe('Good morning, how can I help?');
    expect(first.events.at(-1)?.type).toBe('done');
    const id = conversationOf(first.events);
    expect(id).toBeTruthy();

    // The same conversation continues; it is stored with the person's question and the answer.
    const second = await ask(page, 'Thank you', { conversationId: id });
    expect(conversationOf(second.events)).toBe(id);
    expect(second.text).toContain('You said: Thank you');
    const rows = await db().enyoMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' }, select: { role: true, content: true } });
    expect(rows.filter((r) => r.role === 'USER').map((r) => r.content)).toEqual(['[[say:Good morning, how can I help?]]', 'Thank you']);
    expect(rows.filter((r) => r.role === 'ASSISTANT').length).toBe(2);

    // Nobody else can continue (or even see) that conversation.
    await as(page, 'technician');
    const other = await ask(page, 'hello', { conversationId: id });
    expect(other.res.status()).toBe(404);
    expect(other.events[0]).toMatchObject({ type: 'error' });
  });

  test('Finance asks for today\'s takings and gets the figures', async ({ page }) => {
    await as(page, 'finance-officer');
    const r = await ask(page, '[[tool:business_summary {"period":"today"}]]');
    expect(r.res.status()).toBe(200);
    expect(tool(r.events, 'business_summary')).toMatchObject({ ok: true });
    expect(tool(r.events, 'business_summary')?.refused).toBeUndefined();
    expect(r.text).toContain('Here is what I found:');
    expect(r.text).toContain('"takings":');
    expect(r.text).toContain('"revenue":');
    expect(r.events.at(-1)?.type).toBe('done');
  });

  test('a technician asking the same is refused kindly (the tool runs as the technician)', async ({ page }) => {
    await as(page, 'technician');
    const r = await ask(page, '[[tool:business_summary {"period":"today"}]]');
    expect(r.res.status()).toBe(200);
    expect(tool(r.events, 'business_summary')).toMatchObject({ ok: false, refused: true });
    expect(r.text).toContain('Not allowed');
    expect(r.text).toContain('"refused":true');
    expect(r.text).not.toContain('"takings"');
    const stored = await storedToolResult(conversationOf(r.events), 'business_summary');
    expect(stored).toContain('"refused":true');
  });

  test('part_lookup works for a technician: price and stock, never the purchase cost', async ({ page }) => {
    await as(page, 'technician');
    const part = SEED_PARTS.oilFilter;
    const r = await ask(page, `[[tool:part_lookup {"query":"${part.number}"}]]`);
    expect(tool(r.events, 'part_lookup')).toMatchObject({ ok: true });
    expect(r.text).toContain(part.number);
    const stored = await storedToolResult(conversationOf(r.events), 'part_lookup');
    expect(stored).toContain(`"sellingPrice":${part.price}`);
    expect(stored).toContain('"costsShown":false');
    expect(stored).not.toContain('lastUnitCost');
    expect(stored).not.toContain('marginPercent');
  });

  test('guide_search answers "how do I" with the steps and a link to the page', async ({ page }) => {
    await as(page, 'technician');
    const r = await ask(page, '[[tool:guide_search {"query":"request parts from the store"}]]');
    expect(tool(r.events, 'guide_search')).toMatchObject({ ok: true });
    expect(r.text).toContain('/workshop/parts-requests');
    const sources = r.events.find((e) => e.type === 'sources') as { sources?: { href?: string }[] } | undefined;
    expect(sources?.sources?.some((s) => s.href === '/workshop/parts-requests')).toBe(true);
  });

  test('messages over 4,000 characters get a calm error, not an answer', async ({ page }) => {
    await as(page, 'receptionist');
    const r = await ask(page, 'x'.repeat(4001));
    expect(r.res.status()).toBe(413);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ type: 'error' });
    expect(String(r.events[0]?.message)).toContain('4,000 characters');
  });

  test('asking too fast is limited per person, with a calm message', async ({ page }) => {
    // A person no other Enyo test uses, so their count is theirs alone.
    await as(page, 'broadcaster');
    let ok = 0;
    let limited: { res: APIResponse; events: Event[] } | null = null;
    for (let i = 0; i <= LIMIT; i += 1) {
      const r = await ask(page, `[[say:ok ${i}]]`);
      if (r.res.status() === 429) { limited = r; break; }
      expect(r.res.status()).toBe(200);
      ok += 1;
    }
    expect(limited, `no limit after ${ok} questions`).not.toBeNull();
    expect(ok).toBeLessThanOrEqual(LIMIT);
    expect(limited!.events[0]).toMatchObject({ type: 'error' });
    expect(String(limited!.events[0]?.message)).toContain('wait a minute');
  });

  test('signed out: the chat refuses (redirect to sign-in or 401)', async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: BASE });
    const res = await anon.post('/api/enyo/chat', { data: { message: 'hello' }, headers: { origin: BASE }, maxRedirects: 0 });
    expect([301, 302, 303, 307, 308, 401]).toContain(res.status());
    if (res.status() !== 401) expect(res.headers().location ?? '').toContain('/login');
    expect(await res.text()).not.toContain('"type":"text"');
    await anon.dispose();
  });

  test('a request from another site is refused (CSRF)', async ({ page }) => {
    await as(page, 'receptionist');
    const r = await ask(page, '[[say:should not answer]]', {}, 'https://evil.example');
    expect(r.res.status()).toBe(403);
    expect(r.text).toBe('');
    const refine = await page.request.post('/api/enyo/refine', { data: { text: 'hello' }, headers: { origin: 'https://evil.example' } });
    expect(refine.status()).toBe(403);
  });
});
