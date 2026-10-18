"use strict";
/**
 * Turning a parsed email into what is stored: plain text only (remote HTML is
 * never kept or shown), a short snippet, a thread key and the attachment list
 * (names and sizes only). Pure; relative imports only.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SNIPPET_MAX = exports.BODY_TEXT_MAX = void 0;
exports.stripImageRefs = stripImageRefs;
exports.cleanBody = cleanBody;
exports.snippetOf = snippetOf;
exports.withAttachments = withAttachments;
exports.splitAttachments = splitAttachments;
exports.formatSize = formatSize;
exports.normalizeSubject = normalizeSubject;
exports.threadKeyOf = threadKeyOf;
exports.flattenAddresses = flattenAddresses;
exports.readAddresses = readAddresses;
exports.addressLabel = addressLabel;
exports.BODY_TEXT_MAX = 100_000;
exports.SNIPPET_MAX = 200;
/**
 * Attachment names are kept after the text, behind a marker that an email
 * itself can never contain (the private-use character is removed from every
 * incoming text first), so a sender cannot fake the list.
 */
const MARK = '';
const ATTACHMENTS_HEADER = `${MARK}attachments${MARK}`;
/**
 * The text versions of HTML emails show each picture as its address in
 * brackets ("Kewalram Chanrai Group [https://…/logo.png]", "[cid:…]"). In a
 * text view those are noise: they are removed (the picture itself shows in
 * the email's own layout).
 */
function stripImageRefs(text) {
    return text
        .replace(/\s?\[(?:cid:[^\]\s]{1,300}|https?:\/\/[^\]\s]{1,600}\.(?:png|jpe?g|gif|webp|bmp|svg|ico)(?:\?[^\]\s]{0,300})?)\]/gi, '')
        .replace(/^\s*\[image:[^\]]{0,300}\]\s*$/gim, '');
}
/** Control characters out, line endings unified, picture addresses removed, clipped. */
function cleanBody(text, max = exports.BODY_TEXT_MAX) {
    if (!text)
        return '';
    const t = stripImageRefs(text)
        .replace(/\r\n?/g, '\n')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{4,}/g, '\n\n\n')
        .trim();
    return t.length > max ? `${t.slice(0, max)}\n\n[The rest of this message is too long to show here. Open it in your mail app to read all of it.]` : t;
}
function snippetOf(text) {
    const flat = text.replace(/^>.*$/gm, ' ').replace(/\s+/g, ' ').trim();
    return flat.length > exports.SNIPPET_MAX ? `${flat.slice(0, exports.SNIPPET_MAX - 1).trimEnd()}…` : flat;
}
function withAttachments(body, attachments) {
    if (!attachments.length)
        return body;
    const list = attachments.slice(0, 30).map((a) => `${a.name.replace(/[\n]/g, ' ').slice(0, 200)}${MARK}${Math.max(0, Math.round(a.size))}`).join('\n');
    return `${body}\n${ATTACHMENTS_HEADER}\n${list}`;
}
function splitAttachments(stored) {
    const s = stored ?? '';
    const at = s.lastIndexOf(`\n${ATTACHMENTS_HEADER}\n`);
    if (at === -1)
        return { body: s, attachments: [] };
    const attachments = s.slice(at + ATTACHMENTS_HEADER.length + 2).split('\n').flatMap((line) => {
        const [name, size] = line.split(MARK);
        return name ? [{ name, size: Number(size) || 0 }] : [];
    });
    return { body: s.slice(0, at), attachments };
}
function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes} bytes`;
    if (bytes < 1024 * 1024)
        return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
/** "Re: Fwd: Hello" → "hello" (for grouping when no message ids are present). */
function normalizeSubject(subject) {
    return subject.replace(/^\s*((re|fw|fwd|aw|sv)\s*(\[\d+\])?\s*:\s*)+/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
const cleanId = (v) => {
    if (!v)
        return null;
    const m = /<?([^<>\s]{1,300})>?/.exec(v.trim());
    return m ? `<${m[1]}>` : null;
};
/**
 * One key per conversation: the first message of the thread (References),
 * else the message replied to, else this message's own id, else the subject.
 */
function threadKeyOf(m) {
    const refs = Array.isArray(m.references) ? m.references : typeof m.references === 'string' ? m.references.split(/\s+/) : [];
    const root = cleanId(refs.find((r) => r.trim()) ?? null) ?? cleanId(m.inReplyTo) ?? cleanId(m.messageId);
    if (root)
        return root.slice(0, 300);
    return `subject:${normalizeSubject(m.subject ?? '')}`.slice(0, 300);
}
/** mailparser's address objects (single, list, or groups) → a flat list of { address, name }. */
function flattenAddresses(v, max = 50) {
    const out = [];
    const visit = (x) => {
        if (!x || out.length >= max)
            return;
        if (Array.isArray(x)) {
            x.forEach(visit);
            return;
        }
        const o = x;
        if (Array.isArray(o.value)) {
            o.value.forEach(visit);
            return;
        }
        if (Array.isArray(o.group)) {
            o.group.forEach(visit);
            return;
        }
        if (typeof o.address === 'string' && o.address.includes('@')) {
            out.push({ address: o.address.trim().toLowerCase().slice(0, 254), ...(typeof o.name === 'string' && o.name.trim() ? { name: o.name.trim().slice(0, 120) } : {}) });
        }
    };
    visit(v);
    return out;
}
/** The stored address list (Json) back into addresses — tolerant of anything unexpected. */
function readAddresses(json) {
    if (!Array.isArray(json))
        return [];
    return json.flatMap((x) => {
        const o = x;
        return typeof o?.address === 'string' ? [{ address: o.address, ...(typeof o.name === 'string' ? { name: o.name } : {}) }] : [];
    });
}
function addressLabel(a) {
    return a.name ? `${a.name} <${a.address}>` : a.address;
}
