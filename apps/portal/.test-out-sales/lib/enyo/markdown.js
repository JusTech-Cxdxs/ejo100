"use strict";
/**
 * A deliberately small Markdown reader for Enyo's answers. It understands
 * paragraphs, bullet and numbered lists, **bold**, *italics*, `code` and
 * [links](…), and nothing else. It returns plain data that the panel turns
 * into React elements, so HTML in an answer is only ever shown as text.
 *
 * Links are kept only when they point inside the portal ("/workshop/…") or
 * to an https address; anything else (javascript:, data:, //host, http:)
 * becomes plain text.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeHref = safeHref;
exports.parseInline = parseInline;
exports.parseMarkdown = parseMarkdown;
exports.plainText = plainText;
const markdown_table_1 = require("./markdown-table");
const citations_1 = require("./citations");
/** The href to use, or null when the link is not safe to follow. */
function safeHref(raw) {
    const href = raw.trim();
    if (!href || href.length > 2000)
        return null;
    // Control characters and spaces can disguise a scheme ("java\tscript:").
    if ([...href].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 || /\s/.test(ch) || ch === '\\'))
        return null;
    if (href.startsWith('/') && !href.startsWith('//'))
        return { href, internal: true };
    if (/^https:\/\/[^/?#]+/i.test(href)) {
        try {
            const u = new URL(href);
            if (u.protocol !== 'https:' || u.username || u.password)
                return null;
            return { href: u.toString(), internal: false };
        }
        catch {
            return null;
        }
    }
    return null;
}
const MAX_DEPTH = 4;
/** Inline marks inside one line or paragraph. */
function parseInline(src, depth = 0) {
    const out = [];
    let buf = '';
    const flush = () => { if (buf) {
        out.push({ t: 'text', v: buf });
        buf = '';
    } };
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        const rest = src.slice(i);
        if (ch === '\\' && i + 1 < src.length && /[\\*_`[\]()]/.test(src[i + 1])) {
            buf += src[i + 1];
            i += 2;
            continue;
        }
        if (ch === '`') {
            const end = src.indexOf('`', i + 1);
            if (end > i + 1) {
                flush();
                out.push({ t: 'code', v: src.slice(i + 1, end) });
                i = end + 1;
                continue;
            }
        }
        if (depth < MAX_DEPTH && (rest.startsWith('**') || rest.startsWith('__'))) {
            const mark = rest.slice(0, 2);
            const end = src.indexOf(mark, i + 2);
            if (end > i + 2) {
                flush();
                out.push({ t: 'b', c: parseInline(src.slice(i + 2, end), depth + 1) });
                i = end + 2;
                continue;
            }
        }
        if (depth < MAX_DEPTH && (ch === '*' || ch === '_') && src[i + 1] && src[i + 1] !== ' ' && src[i + 1] !== ch) {
            // "_" only opens italics at a word boundary, so snake_case stays as typed.
            const prev = i > 0 ? src[i - 1] : ' ';
            if (ch === '*' || !/[A-Za-z0-9]/.test(prev)) {
                let end = -1;
                for (let j = i + 1; j < src.length; j += 1) {
                    if (src[j] === ch && src[j - 1] !== ' ' && src[j + 1] !== ch && (ch === '*' || !/[A-Za-z0-9]/.test(src[j + 1] ?? ' '))) {
                        end = j;
                        break;
                    }
                }
                if (end > i + 1) {
                    flush();
                    out.push({ t: 'i', c: parseInline(src.slice(i + 1, end), depth + 1) });
                    i = end + 1;
                    continue;
                }
            }
        }
        if (ch === '[' && depth < MAX_DEPTH) {
            const close = src.indexOf('](', i + 1);
            let end = -1;
            if (close > 0) {
                // The target ends at the matching ")" (targets may contain balanced parentheses).
                let depthP = 0;
                for (let j = close + 2; j < src.length; j += 1) {
                    const c = src[j];
                    if (c === '\n')
                        break;
                    if (c === '(')
                        depthP += 1;
                    else if (c === ')') {
                        if (depthP === 0) {
                            end = j;
                            break;
                        }
                        depthP -= 1;
                    }
                }
            }
            if (close > i && end > close) {
                const label = src.slice(i + 1, close);
                const target = src.slice(close + 2, end);
                const safe = safeHref(target);
                flush();
                if (safe && label.trim())
                    out.push({ t: 'a', href: safe.href, internal: safe.internal, c: parseInline(label, depth + 1) });
                else
                    out.push(...parseInline(label || target, depth + 1));
                i = end + 1;
                continue;
            }
        }
        buf += ch;
        i += 1;
    }
    flush();
    return out;
}
const BULLET = /^\s{0,3}[-*•]\s+(.*)$/;
const NUMBERED = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;
/** Splits an answer into blocks. Safe on half-finished (streaming) text. */
function parseMarkdown(src) {
    const lines = (0, citations_1.stripCitationMarks)(src ?? '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let para = [];
    let list = null;
    const endPara = () => { if (para.length) {
        blocks.push({ type: 'p', c: parseInline(para.join('\n')) });
        para = [];
    } };
    const endList = () => {
        if (list) {
            const items = list.items.map((s) => parseInline(s));
            blocks.push(list.type === 'ul' ? { type: 'ul', items } : { type: 'ol', items, start: list.start });
            list = null;
        }
    };
    for (let li = 0; li < lines.length; li += 1) {
        const line = lines[li];
        if (!line.trim()) {
            endPara();
            endList();
            continue;
        }
        const t = (0, markdown_table_1.readTable)(lines, li);
        if (t) {
            endPara();
            endList();
            blocks.push({ type: 'table', head: t.table.head.map((c) => parseInline(c)), align: t.table.align, rows: t.table.rows.map((r) => r.map((c) => parseInline(c))) });
            li = t.next - 1;
            continue;
        }
        const b = BULLET.exec(line);
        const n = b ? null : NUMBERED.exec(line);
        if (b || n) {
            endPara();
            const type = b ? 'ul' : 'ol';
            if (!list || list.type !== type) {
                endList();
                list = { type, items: [], start: n ? Number(n[1]) || 1 : 1 };
            }
            list.items.push(b ? b[1] : n[2]);
            continue;
        }
        const h = HEADING.exec(line);
        if (h) {
            endPara();
            endList();
            blocks.push({ type: 'h', c: parseInline(h[1]) });
            continue;
        }
        // A line indented under a list item continues that item.
        if (list && /^\s{2,}\S/.test(line)) {
            list.items[list.items.length - 1] += ` ${line.trim()}`;
            continue;
        }
        endList();
        para.push(line);
    }
    endPara();
    endList();
    return blocks;
}
/** The answer as plain text (for reading aloud and for copying without marks). */
function plainText(src) {
    const walk = (c) => c.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : walk(n.c))).join('');
    return parseMarkdown(src)
        .map((b) => (b.type === 'table'
        // Read aloud row by row: "Category: Decisions waiting, Items: 0."
        ? b.rows.map((r) => `${r.map((c, i) => `${walk(b.head[i] ?? [])}: ${walk(c)}`).join(', ')}.`).join('\n')
        : b.type === 'ul' || b.type === 'ol' ? b.items.map((it) => walk(it)).join('\n') : walk(b.c)))
        .join('\n\n');
}
