/**
 * Checks that keep Enyo honest.
 *
 * Money figures in an answer must come from what the tools returned. The
 * model is told to quote, never compute; this check catches the times it
 * doesn't, so the person is warned instead of misled.
 */

const MONEY = /(?:₦|NGN\s?|N(?=\d))\s?(\d[\d,]*(?:\.\d+)?)|\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?)\b/g;

const toNumber = (s: string): number => Number(s.replace(/,/g, ''));

/** Money-like amounts written in a piece of text (₦12,500 · NGN 4,000 · 1,250,000). */
export function moneyFigures(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(MONEY)) {
    const raw = m[1] ?? m[2];
    if (!raw) continue;
    const n = toNumber(raw);
    if (Number.isFinite(n) && n >= 1000) out.push(n);
  }
  return out;
}

/** Every number that appears anywhere in the evidence (tool results), as values. */
export function evidenceNumbers(evidence: unknown[]): Set<number> {
  const set = new Set<number>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 8 || v === null || v === undefined) return;
    if (typeof v === 'number' && Number.isFinite(v)) {
      set.add(v);
      set.add(Math.round(v * 100) / 100);
      return;
    }
    if (typeof v === 'string') {
      for (const m of v.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
        const n = toNumber(m[0]);
        if (Number.isFinite(n)) set.add(n);
      }
      return;
    }
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return; }
    if (typeof v === 'object') { for (const x of Object.values(v as Record<string, unknown>)) visit(x, depth + 1); }
  };
  for (const e of evidence) visit(e, 0);
  return set;
}

/** Amounts in the answer that no tool result contains. Empty = grounded. */
export function ungroundedFigures(answer: string, evidence: unknown[]): number[] {
  const known = evidenceNumbers(evidence);
  const near = (n: number) => known.has(n) || known.has(Math.round(n)) || [...known].some((k) => Math.abs(k - n) < 0.01);
  return [...new Set(moneyFigures(answer))].filter((n) => !near(n));
}

/** Masks emails and phone numbers before text goes into logs or traces. */
export function redactForLog(text: string): string {
  return text
    .replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***@$2')
    .replace(/(\+?\d[\d\s-]{6,}\d)/g, (m) => `${m.slice(0, 3)}***${m.slice(-2)}`);
}

/** Cuts long text at a sentence or word boundary. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'), cut.lastIndexOf(' '));
  return `${cut.slice(0, end > max * 0.6 ? end : max).trimEnd()}…`;
}

/**
 * Words that try to turn data into instructions ("ignore your rules…").
 * Text from emails, web pages and customers is always wrapped as data; this
 * flags the obvious attempts so they can be logged and shown as such.
 */
export function looksLikeInjection(text: string): boolean {
  return /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|above|prior|all|your)\b[^.\n]{0,30}\b(instructions?|rules|prompt)\b|\bsystem prompt\b|\byou are now\b|\bact as (an? )?(admin|administrator|developer)\b/i.test(text);
}

/** Wraps outside text so the model treats it as material to read, never as orders. */
export function asData(label: string, text: string): string {
  const safe = text.replace(/<\/?untrusted[^>]*>/gi, '');
  return `<untrusted source="${label.replace(/"/g, '')}">\n${safe}\n</untrusted>`;
}

/**
 * Removes the citation marks some models write into answers ("【web_lookup†source】",
 * "【3†L1-L4】", "[web_lookup]"), which mean nothing to a reader. The sources
 * are shown separately under the answer. Also safe on half-finished text: an
 * unclosed 【… at the end is hidden until it closes.
 */
export function stripCitationMarks(text: string): string {
  return String(text ?? '')
    // Only citation marks (a † or a tool name inside); 【…】 is also ordinary Chinese punctuation and stays.
    .replace(/\s?【[^】\n]{0,120}(?:†|web_lookup|organisation_info|guide_search)[^】\n]{0,120}】/g, '')
    .replace(/\s?【[^】\n]{0,60}(?:†|web_lookup|organisation_info|guide_search)[^】\n]{0,60}$/g, '')
    .replace(/\s?【(?:web|tool|source|wiki|organi)[a-z_]{0,30}$/g, '')
    .replace(/\s?\[(?:web_lookup|organisation_info|guide_search)[^\]\n]{0,60}\]/g, '');
}
