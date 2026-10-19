/**
 * Article Markdown for the website's news & media (pure, no React, no HTML):
 * paragraphs, ## / ### headings, bullet and numbered lists, > quotes,
 * **bold**, *italic*, `code`, [links](https://…) and ![pictures](https://…).
 * Parsed into plain data; the apps render the data as elements, so nothing
 * written by the communications team can inject markup or script. Links and
 * pictures are kept only for https addresses or this site's own paths.
 */
export type ArticleInline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: ArticleInline[] }
  | { t: 'em'; c: ArticleInline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: ArticleInline[] }
  | { t: 'br' };

export type ArticleBlock =
  | { t: 'h'; level: 2 | 3; c: ArticleInline[]; id: string }
  | { t: 'p'; c: ArticleInline[] }
  | { t: 'quote'; c: ArticleInline[] }
  | { t: 'img'; src: string; alt: string; caption: string | null }
  | { t: 'ul'; items: ArticleInline[][] }
  | { t: 'ol'; items: ArticleInline[][]; start: number }
  | { t: 'hr' };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const IMAGE = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/;

export function safeArticleHref(raw: string): string | null {
  const v = raw.trim();
  if (/^\/(?!\/)[^\s<>"']*$/.test(v)) return v;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname.includes('.') ? u.toString() : null;
  } catch { return null; }
}

export function headingId(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'section';
}

export function parseArticle(src: string): ArticleBlock[] {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: ArticleBlock[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) out.push({ t: 'p', c: inlineLines(para) }); para = []; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) { flush(); continue; }
    if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); out.push({ t: 'hr' }); continue; }
    const img = IMAGE.exec(line);
    if (img) {
      flush();
      const src = safeArticleHref(img[2]!);
      if (src) out.push({ t: 'img', src, alt: img[1]!.trim(), caption: img[3]?.trim() || null });
      continue;
    }
    const h = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const text = h[2]!.replace(/\s+#+\s*$/, '').trim();
      out.push({ t: 'h', level: h[1]!.length <= 2 ? 2 : 3, c: inline(text), id: headingId(text) });
      continue;
    }
    if (/^\s{0,3}>\s?/.test(line)) {
      flush();
      const q: string[] = [];
      let j = i;
      for (; j < lines.length && /^\s{0,3}>\s?/.test(lines[j]!); j++) q.push(lines[j]!.replace(/^\s{0,3}>\s?/, ''));
      out.push({ t: 'quote', c: inlineLines(q) });
      i = j - 1;
      continue;
    }
    const b = BULLET.exec(line);
    const n = NUMBERED.exec(line);
    if (b || n) {
      flush();
      const ordered = !b;
      const items: ArticleInline[][] = [];
      const start = n ? Number(n[1]) : 1;
      let j = i;
      for (; j < lines.length; j++) {
        const m = ordered ? NUMBERED.exec(lines[j]!) : BULLET.exec(lines[j]!);
        if (m) { items.push(inline(ordered ? m[2]! : m[1]!)); continue; }
        if (lines[j]!.trim() && /^\s{2,}/.test(lines[j]!) && items.length) { items[items.length - 1]!.push({ t: 'text', v: ' ' }, ...inline(lines[j]!.trim())); continue; }
        break;
      }
      out.push(ordered ? { t: 'ol', items, start } : { t: 'ul', items });
      i = j - 1;
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

function inlineLines(lines: string[]): ArticleInline[] {
  const out: ArticleInline[] = [];
  lines.forEach((l, i) => {
    if (i) out.push(/ {2,}$/.test(lines[i - 1]!) ? { t: 'br' } : { t: 'text', v: ' ' });
    out.push(...inline(l.trim()));
  });
  return out;
}

const TOKEN = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))|(<https?:\/\/[^>\s]+>)|(https?:\/\/[^\s<>"')\]]+)/;

export function inline(text: string): ArticleInline[] {
  const out: ArticleInline[] = [];
  let rest = text;
  while (rest) {
    const m = TOKEN.exec(rest);
    if (!m) { out.push({ t: 'text', v: rest }); break; }
    if (m.index > 0) out.push({ t: 'text', v: rest.slice(0, m.index) });
    const tok = m[0];
    if (m[1]) out.push({ t: 'code', v: tok.slice(1, -1) });
    else if (m[2] || m[3]) out.push({ t: 'strong', c: inline(tok.slice(2, -2)) });
    else if (m[4] || m[5]) out.push({ t: 'em', c: inline(tok.slice(1, -1)) });
    else if (m[6]) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      const href = safeArticleHref(lm[2]!);
      if (href) out.push({ t: 'link', href, c: inline(lm[1]!) }); else out.push({ t: 'text', v: lm[1]! });
    } else {
      const raw = m[7] ? tok.slice(1, -1) : tok;
      const href = safeArticleHref(raw);
      if (href) out.push({ t: 'link', href, c: [{ t: 'text', v: raw }] }); else out.push({ t: 'text', v: tok });
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

/** The plain words of an article (for search and reading time). */
export function articleText(blocks: ArticleBlock[]): string {
  const inl = (c: ArticleInline[]): string => c.map((x) => (x.t === 'text' || x.t === 'code' ? x.v : x.t === 'br' ? ' ' : inl(x.c))).join('');
  return blocks.map((b) => (b.t === 'img' ? b.alt : b.t === 'hr' ? '' : b.t === 'ul' || b.t === 'ol' ? b.items.map(inl).join(' ') : inl(b.c))).join(' ').replace(/\s+/g, ' ').trim();
}
