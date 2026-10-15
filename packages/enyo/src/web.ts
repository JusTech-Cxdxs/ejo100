/**
 * General knowledge from the open web, free and without a key: Wikipedia's
 * public API (search, then each page's introduction as plain text). Used for
 * questions outside the organisation ("who is the president of Nigeria?",
 * "what is a CVT gearbox?", "tell me about this organisation's history").
 *
 * - Read only. Nothing about the person or the organisation's records is
 *   sent: only the words of the question.
 * - The text comes back wrapped as <untrusted> material, never instructions.
 * - Short timeouts and small answers; failures say "not available" and Enyo
 *   answers from what it knows, saying it may be out of date.
 * - Switched off with ENYO_WEB_LOOKUP=off on the server.
 */
import { asData } from './guardrails';
import type { Tool, ToolResult } from './tools';

export type WebPage = { title: string; url: string; text: string };
export type WebLookup = { query: string; pages: WebPage[]; retrievedAt: string; source: string };

type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const UA = 'EJO100-Enyo/1.0 (https://justech-dev.vercel.app; ERP assistant)';
const LANGS = new Set(['en', 'fr', 'ha', 'ig', 'yo', 'ar', 'zh', 'hi']);

export function webLookupEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.ENYO_WEB_LOOKUP ?? '').trim().toLowerCase() !== 'off';
}

/**
 * A clean search phrase: plain words only, at most 120 characters, with
 * anything that could identify a person or a record removed first (emails,
 * phone numbers, links, number plates, VINs, reference numbers like
 * JC-2026-000412) — those never leave for the web.
 */
export function cleanQuery(raw: string): string {
  return String(raw ?? '')
    .replace(/\bhttps?:\/\/\S+/gi, ' ')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ')
    .replace(/\b[A-Z]{2,4}-\d{4}-\d{3,}\b/gi, ' ')
    .replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi, (m) => (/\d/.test(m) ? ' ' : m))
    // Plates as written on records: LSR-123-XY, KJA123AB (capitals; "GLE 450 AMG" or "BMW 320i" are left alone).
    .replace(/\b[A-Z]{3}-?\d{2,4}-?[A-Z]{2,3}\b/g, ' ')
    .replace(/(?:\+?\d[\s.-]?){7,}/g, ' ')
    .replace(/[\u0000-\u001f<>{}[\]\\^`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** First paragraphs only, cut at a sentence end near `max` characters. */
export function trimExtract(text: string, max = 1400): string {
  const t = text.replace(/\n{2,}/g, '\n').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut}…`;
}

async function getJson(fetchImpl: FetchLike, url: string, ms: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Search Wikipedia and read the introductions of the top pages. */
export async function webLookup(rawQuery: string, opts: { lang?: string; limit?: number; fetchImpl?: FetchLike; timeoutMs?: number } = {}): Promise<WebLookup> {
  const query = cleanQuery(rawQuery);
  const lang = opts.lang && LANGS.has(opts.lang) ? opts.lang : 'en';
  const limit = Math.min(Math.max(opts.limit ?? 3, 1), 4);
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const ms = opts.timeoutMs ?? 5000;
  const base = `https://${lang}.wikipedia.org/w/api.php`;
  const search = (await getJson(fetchImpl, `${base}?action=query&list=search&format=json&formatversion=2&srlimit=${limit}&srsearch=${encodeURIComponent(query)}`, ms)) as { query?: { search?: { title: string }[] } };
  const titles = (search.query?.search ?? []).map((s) => s.title).filter((t) => typeof t === 'string').slice(0, limit);
  if (!titles.length) return { query, pages: [], retrievedAt: new Date().toISOString(), source: 'Wikipedia' };
  const read = (await getJson(fetchImpl, `${base}?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(titles.join('|'))}`, ms)) as { query?: { pages?: { title: string; extract?: string; missing?: boolean }[] } };
  const byTitle = new Map((read.query?.pages ?? []).filter((p) => !p.missing && p.extract).map((p) => [p.title, p.extract!]));
  const pages = titles
    .map((t) => ({ title: t, text: byTitle.get(t) ?? '' }))
    .filter((p) => p.text.trim().length > 40)
    .map((p) => ({ title: p.title, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, text: trimExtract(p.text) }));
  return { query, pages, retrievedAt: new Date().toISOString(), source: 'Wikipedia' };
}

/** The tool, the same in the staff portal, the customer portal and the website. */
export function webLookupTool<Ctx>(opts: { fetchImpl?: FetchLike } = {}): Tool<Ctx> {
  return {
    name: 'web_lookup',
    kind: 'read',
    status: 'Looking it up on the web…',
    description:
      'General knowledge from the public web (Wikipedia): people, places, countries and who currently holds an office, history, science, how things work, vehicles and brands, and public background on an organisation. Use it for questions that are NOT about this organisation\'s own records, especially anything current that may have changed since your training. Send only the topic words, never names of customers or staff or anything from the records. Answer briefly from what it returns, name the source, and say it may not be fully up to date.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Topic words, e.g. "President of Nigeria" or "continuously variable transmission".', minLength: 2, maxLength: 120 },
        language: { type: 'string', enum: [...LANGS], description: 'Wikipedia language (default en).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async run(args): Promise<ToolResult> {
      if (!webLookupEnabled()) return { ok: false, message: 'Web look-up is switched off on this installation. Answer from general knowledge, say it may be out of date, or say you cannot check.' };
      if (cleanQuery(String(args.query ?? '')).length < 2) return { ok: false, message: 'That search had nothing to look up once personal details and reference numbers were removed. Never send those to the web.' };
      try {
        const r = await webLookup(String(args.query ?? ''), { lang: typeof args.language === 'string' ? args.language : undefined, fetchImpl: opts.fetchImpl });
        if (!r.pages.length) return { ok: false, message: 'Nothing relevant was found on the web for that. Say so; answer from general knowledge only if you are confident, and say it may be out of date.' };
        return {
          ok: true,
          data: { source: r.source, retrievedAt: r.retrievedAt, pages: r.pages.map((p) => ({ title: p.title, url: p.url, text: asData(`Wikipedia: ${p.title}`, p.text) })) },
          sources: r.pages.slice(0, 2).map((p) => ({ label: `Wikipedia: ${p.title}` })),
        };
      } catch {
        return { ok: false, message: 'The web could not be reached just now. Answer from general knowledge if you can, saying it may be out of date and could not be checked.' };
      }
    },
  };
}
