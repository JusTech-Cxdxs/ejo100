/**
 * General knowledge from the open web. Two sources, used together:
 *
 * - Wikipedia's public API (free, no key): search, then each page's
 *   introduction as plain text.
 * - A general web search engine, when the installation has a key for one in
 *   its server settings (never in code or chat): SERPER_API_KEY (Google
 *   results via serper.dev), BRAVE_SEARCH_API_KEY (Brave Search) or
 *   TAVILY_API_KEY (Tavily). The first one set is used. This finds what
 *   Wikipedia does not hold: business leaders and their public professional
 *   profiles (LinkedIn), company news, recent events.
 *
 * Used for questions outside the organisation's own records ("who is the
 * president of Nigeria?", "what is a CVT gearbox?", "who is <a named business
 * leader>?").
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

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
type Env = Record<string, string | undefined>;

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

async function getJson(fetchImpl: FetchLike, url: string, ms: number, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetchImpl(url, { method: init.method, body: init.body, headers: { 'user-agent': UA, accept: 'application/json', ...(init.headers ?? {}) }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const STOP = new Set(['the', 'and', 'for', 'who', 'what', 'when', 'where', 'which', 'how', 'why', 'are', 'was', 'were', 'is', 'of', 'in', 'on', 'at', 'to', 'a', 'an', 'about', 'tell', 'me', 'does', 'did', 'with', 'from', 'this', 'that', 'current', 'currently', 'now', 'today', 'latest', 'please']);

/**
 * Whether a page is about what was asked: at least half of the question's
 * meaningful words appear in its title or text. Search engines always return
 * something; unrelated pages ("who is <a name>" returning random articles)
 * are dropped instead of shown as sources.
 */
export function relevantTo(query: string, page: { title: string; text: string }): boolean {
  const words = [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w)))];
  if (!words.length) return true;
  const hay = `${page.title} ${page.text}`.toLowerCase();
  const hits = words.filter((w) => hay.includes(w)).length;
  return hits >= Math.ceil(words.length / 2);
}

// ───────────────────────────────────────────── general web search (optional)

export type SearchProvider = { name: 'serper' | 'brave' | 'tavily'; label: string; key: string };

/** The general search engine this installation has a key for (first set wins), or null. */
export function searchProvider(env: Env = process.env): SearchProvider | null {
  const k = (n: string) => (env[n] ?? '').trim();
  if (k('SERPER_API_KEY')) return { name: 'serper', label: 'Google', key: k('SERPER_API_KEY') };
  if (k('BRAVE_SEARCH_API_KEY')) return { name: 'brave', label: 'Brave Search', key: k('BRAVE_SEARCH_API_KEY') };
  if (k('TAVILY_API_KEY')) return { name: 'tavily', label: 'Tavily', key: k('TAVILY_API_KEY') };
  return null;
}

/** Where a result came from, for the answer: "linkedin.com", "kewalramchanrai.com". */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').replace(/^[a-z]{2}\.linkedin\.com$/, 'linkedin.com');
  } catch {
    return '';
  }
}

const plain = (t: unknown) => String(t ?? '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const httpsOnly = (u: unknown) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : '');

/** One search on the general engine: titles, links and snippets of the top results. */
export async function webSearch(rawQuery: string, opts: { provider?: SearchProvider | null; limit?: number; fetchImpl?: FetchLike; timeoutMs?: number } = {}): Promise<WebLookup> {
  const query = cleanQuery(rawQuery);
  const provider = opts.provider === undefined ? searchProvider() : opts.provider;
  const empty = (source: string): WebLookup => ({ query, pages: [], retrievedAt: new Date().toISOString(), source });
  if (!provider || query.length < 2) return empty('');
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 8);
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const ms = opts.timeoutMs ?? 6000;
  let rows: { title: unknown; url: unknown; text: unknown }[] = [];
  if (provider.name === 'serper') {
    const r = (await getJson(fetchImpl, 'https://google.serper.dev/search', ms, { method: 'POST', headers: { 'X-API-KEY': provider.key, 'content-type': 'application/json' }, body: JSON.stringify({ q: query, num: limit, gl: 'ng', hl: 'en' }) })) as { knowledgeGraph?: { title?: string; type?: string; description?: string; descriptionLink?: string; website?: string }; organic?: { title?: string; link?: string; snippet?: string }[] };
    const kg = r.knowledgeGraph;
    if (kg?.title && kg.description) rows.push({ title: `${kg.title}${kg.type ? ` (${kg.type})` : ''}`, url: kg.descriptionLink || kg.website || '', text: kg.description });
    rows.push(...(r.organic ?? []).map((o) => ({ title: o.title, url: o.link, text: o.snippet })));
  } else if (provider.name === 'brave') {
    const r = (await getJson(fetchImpl, `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}&country=ng&safesearch=strict`, ms, { headers: { 'X-Subscription-Token': provider.key } })) as { web?: { results?: { title?: string; url?: string; description?: string; extra_snippets?: string[] }[] } };
    rows = (r.web?.results ?? []).map((o) => ({ title: o.title, url: o.url, text: [o.description, ...(o.extra_snippets ?? []).slice(0, 2)].filter(Boolean).join(' ') }));
  } else {
    const r = (await getJson(fetchImpl, 'https://api.tavily.com/search', ms, { method: 'POST', headers: { authorization: `Bearer ${provider.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ query, max_results: limit, search_depth: 'basic', include_answer: false }) })) as { results?: { title?: string; url?: string; content?: string }[] };
    rows = (r.results ?? []).map((o) => ({ title: o.title, url: o.url, text: o.content }));
  }
  const seen = new Set<string>();
  const pages = rows
    .map((o) => ({ title: plain(o.title).slice(0, 160), url: httpsOnly(o.url), text: trimExtract(plain(o.text), 700) }))
    .filter((p) => p.title && p.text.length > 20 && relevantTo(query, p) && !(p.url && seen.has(p.url)) && (p.url ? seen.add(p.url) : true))
    .slice(0, limit);
  return { query, pages, retrievedAt: new Date().toISOString(), source: provider.label };
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
    .filter((p) => p.text.trim().length > 40 && relevantTo(query, p))
    .map((p) => ({ title: p.title, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, text: trimExtract(p.text) }));
  return { query, pages, retrievedAt: new Date().toISOString(), source: 'Wikipedia' };
}

/** The tool, the same in the staff portal, the customer portal and the website. */
export function webLookupTool<Ctx>(opts: { fetchImpl?: FetchLike; env?: Env } = {}): Tool<Ctx> {
  const provider = searchProvider(opts.env ?? process.env);
  return {
    name: 'web_lookup',
    kind: 'read',
    status: 'Looking it up on the web…',
    description:
      `General knowledge from the public web (${provider ? `${provider.label} web search and Wikipedia` : 'Wikipedia'}): people in public life and business leaders, places, countries and who currently holds an office, history, science, how things work, vehicles and brands, company news and public background on an organisation. Use it for questions that are NOT about this organisation's own records, especially anything current that may have changed since your training. For "who is <name>": first check the organisation's own people (the organisation information tool), then search here with the name and any organisation or role words you know ("Jane Doe Kewalram"). Send only the topic words, never a customer's name or anything from the records. About a person, give only their public professional facts (role, organisation, career) with the source; never a home address, phone, family or other private details. If the results do not clearly match the same person, say you could not confirm who they are. Answer briefly, name the source site, and say it may not be fully up to date.`,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Topic words, e.g. "President of Nigeria", "continuously variable transmission", or a name with its organisation.', minLength: 2, maxLength: 120 },
        language: { type: 'string', enum: [...LANGS], description: 'Wikipedia language (default en).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async run(args): Promise<ToolResult> {
      if (!webLookupEnabled(opts.env ?? process.env)) return { ok: false, message: 'Web look-up is switched off on this installation. Answer from general knowledge, say it may be out of date, or say you cannot check.' };
      const raw = String(args.query ?? '');
      if (cleanQuery(raw).length < 2) return { ok: false, message: 'That search had nothing to look up once personal details and reference numbers were removed. Never send those to the web.' };
      const lang = typeof args.language === 'string' ? args.language : undefined;
      const [general, wiki] = await Promise.allSettled([
        provider ? webSearch(raw, { provider, fetchImpl: opts.fetchImpl }) : Promise.resolve(null),
        webLookup(raw, { lang, fetchImpl: opts.fetchImpl }),
      ]);
      const g = general.status === 'fulfilled' ? general.value : null;
      const w = wiki.status === 'fulfilled' ? wiki.value : null;
      if (!g && !w) return { ok: false, message: 'The web could not be reached just now. Answer from general knowledge if you can, saying it may be out of date and could not be checked.' };
      // Titles come from the web too: they reach the model only inside the untrusted block, with the text.
      const pages = [
        ...(g?.pages ?? []).map((p) => ({ title: p.title, url: p.url, site: siteOf(p.url) || g!.source, text: p.text })),
        ...(w?.pages ?? []).map((p) => ({ title: p.title, url: p.url, site: 'wikipedia.org', text: p.text })),
      ];
      const results = pages.map((p) => ({ url: p.url, site: p.site, text: asData(p.site === 'wikipedia.org' ? 'Wikipedia' : p.site, `${p.title}\n${p.text}`) }));
      if (!results.length) return { ok: false, message: 'Nothing relevant was found on the web for that. Say so plainly; answer from general knowledge only if you are confident, and say it may be out of date. For a person, say you could not find public information about them.' };
      return {
        ok: true,
        data: {
          searched: [g?.pages.length ? g.source : null, w?.pages.length ? 'Wikipedia' : null].filter(Boolean),
          retrievedAt: (g ?? w)!.retrievedAt,
          howToUse: 'Use only results that clearly match what was asked; ignore unrelated pages. Name the site in plain words ("according to LinkedIn", "Wikipedia says"). Do not write citation marks or brackets like 【…】.',
          results,
        },
        sources: pages.slice(0, 3).map((r) => ({ label: (r.site === 'wikipedia.org' ? `Wikipedia: ${r.title}` : `${r.site}: ${r.title}`).slice(0, 90), ...(r.url ? { href: r.url } : {}) })),
      };
    },
  };
}
