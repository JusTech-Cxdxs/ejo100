"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeArticleHref = safeArticleHref;
exports.headingId = headingId;
exports.parseArticle = parseArticle;
exports.inline = inline;
exports.articleText = articleText;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const IMAGE = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/;
function safeArticleHref(raw) {
    const v = raw.trim();
    if (/^\/(?!\/)[^\s<>"']*$/.test(v))
        return v;
    try {
        const u = new URL(v);
        return u.protocol === 'https:' && u.hostname.includes('.') ? u.toString() : null;
    }
    catch {
        return null;
    }
}
function headingId(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'section';
}
function parseArticle(src) {
    const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let para = [];
    const flush = () => { if (para.length)
        out.push({ t: 'p', c: inlineLines(para) }); para = []; };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) {
            flush();
            continue;
        }
        if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
            flush();
            out.push({ t: 'hr' });
            continue;
        }
        const img = IMAGE.exec(line);
        if (img) {
            flush();
            const src = safeArticleHref(img[2]);
            if (src)
                out.push({ t: 'img', src, alt: img[1].trim(), caption: img[3]?.trim() || null });
            continue;
        }
        const h = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
        if (h) {
            flush();
            const text = h[2].replace(/\s+#+\s*$/, '').trim();
            out.push({ t: 'h', level: h[1].length <= 2 ? 2 : 3, c: inline(text), id: headingId(text) });
            continue;
        }
        if (/^\s{0,3}>\s?/.test(line)) {
            flush();
            const q = [];
            let j = i;
            for (; j < lines.length && /^\s{0,3}>\s?/.test(lines[j]); j++)
                q.push(lines[j].replace(/^\s{0,3}>\s?/, ''));
            out.push({ t: 'quote', c: inlineLines(q) });
            i = j - 1;
            continue;
        }
        const b = BULLET.exec(line);
        const n = NUMBERED.exec(line);
        if (b || n) {
            flush();
            const ordered = !b;
            const items = [];
            const start = n ? Number(n[1]) : 1;
            let j = i;
            for (; j < lines.length; j++) {
                const m = ordered ? NUMBERED.exec(lines[j]) : BULLET.exec(lines[j]);
                if (m) {
                    items.push(inline(ordered ? m[2] : m[1]));
                    continue;
                }
                if (lines[j].trim() && /^\s{2,}/.test(lines[j]) && items.length) {
                    items[items.length - 1].push({ t: 'text', v: ' ' }, ...inline(lines[j].trim()));
                    continue;
                }
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
function inlineLines(lines) {
    const out = [];
    lines.forEach((l, i) => {
        if (i)
            out.push(/ {2,}$/.test(lines[i - 1]) ? { t: 'br' } : { t: 'text', v: ' ' });
        out.push(...inline(l.trim()));
    });
    return out;
}
const TOKEN = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))|(<https?:\/\/[^>\s]+>)|(https?:\/\/[^\s<>"')\]]+)/;
function inline(text) {
    const out = [];
    let rest = text;
    while (rest) {
        const m = TOKEN.exec(rest);
        if (!m) {
            out.push({ t: 'text', v: rest });
            break;
        }
        if (m.index > 0)
            out.push({ t: 'text', v: rest.slice(0, m.index) });
        const tok = m[0];
        if (m[1])
            out.push({ t: 'code', v: tok.slice(1, -1) });
        else if (m[2] || m[3])
            out.push({ t: 'strong', c: inline(tok.slice(2, -2)) });
        else if (m[4] || m[5])
            out.push({ t: 'em', c: inline(tok.slice(1, -1)) });
        else if (m[6]) {
            const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
            const href = safeArticleHref(lm[2]);
            if (href)
                out.push({ t: 'link', href, c: inline(lm[1]) });
            else
                out.push({ t: 'text', v: lm[1] });
        }
        else {
            const raw = m[7] ? tok.slice(1, -1) : tok;
            const href = safeArticleHref(raw);
            if (href)
                out.push({ t: 'link', href, c: [{ t: 'text', v: raw }] });
            else
                out.push({ t: 'text', v: tok });
        }
        rest = rest.slice(m.index + tok.length);
    }
    return out;
}
/** The plain words of an article (for search and reading time). */
function articleText(blocks) {
    const inl = (c) => c.map((x) => (x.t === 'text' || x.t === 'code' ? x.v : x.t === 'br' ? ' ' : inl(x.c))).join('');
    return blocks.map((b) => (b.t === 'img' ? b.alt : b.t === 'hr' ? '' : b.t === 'ul' || b.t === 'ol' ? b.items.map(inl).join(' ') : inl(b.c))).join(' ').replace(/\s+/g, ' ').trim();
}
