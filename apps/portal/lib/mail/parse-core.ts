/**
 * Turning a parsed email into what is stored: plain text only (remote HTML is
 * never kept or shown), a short snippet, a thread key and the attachment list
 * (names and sizes only). Pure; relative imports only.
 */

export const BODY_TEXT_MAX = 100_000;
export const SNIPPET_MAX = 200;

/**
 * Attachment names are kept after the text, behind a marker that an email
 * itself can never contain (the private-use character is removed from every
 * incoming text first), so a sender cannot fake the list.
 */
const MARK = '';
const ATTACHMENTS_HEADER = `${MARK}attachments${MARK}`;

export type AttachmentInfo = { name: string; size: number };

/**
 * The text versions of HTML emails show each picture as its address in
 * brackets ("Kewalram Chanrai Group [https://…/logo.png]", "[cid:…]"). In a
 * text view those are noise: they are removed (the picture itself shows in
 * the email's own layout).
 */
export function stripImageRefs(text: string): string {
  return text
    .replace(/\s?\[(?:cid:[^\]\s]{1,300}|https?:\/\/[^\]\s]{1,600}\.(?:png|jpe?g|gif|webp|bmp|svg|ico)(?:\?[^\]\s]{0,300})?)\]/gi, '')
    .replace(/^\s*\[image:[^\]]{0,300}\]\s*$/gim, '');
}

/** Control characters out, line endings unified, picture addresses removed, clipped. */
export function cleanBody(text: string | null | undefined, max = BODY_TEXT_MAX): string {
  if (!text) return '';
  const t = stripImageRefs(text)
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  return t.length > max ? `${t.slice(0, max)}\n\n[The rest of this message is too long to show here. Open it in your mail app to read all of it.]` : t;
}

export function snippetOf(text: string): string {
  const flat = text.replace(/^>.*$/gm, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > SNIPPET_MAX ? `${flat.slice(0, SNIPPET_MAX - 1).trimEnd()}…` : flat;
}

export function withAttachments(body: string, attachments: AttachmentInfo[]): string {
  if (!attachments.length) return body;
  const list = attachments.slice(0, 30).map((a) => `${a.name.replace(/[\n]/g, ' ').slice(0, 200)}${MARK}${Math.max(0, Math.round(a.size))}`).join('\n');
  return `${body}\n${ATTACHMENTS_HEADER}\n${list}`;
}

export function splitAttachments(stored: string | null | undefined): { body: string; attachments: AttachmentInfo[] } {
  const s = stored ?? '';
  const at = s.lastIndexOf(`\n${ATTACHMENTS_HEADER}\n`);
  if (at === -1) return { body: s, attachments: [] };
  const attachments = s.slice(at + ATTACHMENTS_HEADER.length + 2).split('\n').flatMap((line) => {
    const [name, size] = line.split(MARK);
    return name ? [{ name, size: Number(size) || 0 }] : [];
  });
  return { body: s.slice(0, at), attachments };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "Re: Fwd: Hello" → "hello" (for grouping when no message ids are present). */
export function normalizeSubject(subject: string): string {
  return subject.replace(/^\s*((re|fw|fwd|aw|sv)\s*(\[\d+\])?\s*:\s*)+/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const cleanId = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const m = /<?([^<>\s]{1,300})>?/.exec(v.trim());
  return m ? `<${m[1]}>` : null;
};

/**
 * One key per conversation: the first message of the thread (References),
 * else the message replied to, else this message's own id, else the subject.
 */
export function threadKeyOf(m: { messageId?: string | null; inReplyTo?: string | null; references?: string[] | string | null; subject?: string | null }): string {
  const refs = Array.isArray(m.references) ? m.references : typeof m.references === 'string' ? m.references.split(/\s+/) : [];
  const root = cleanId(refs.find((r) => r.trim()) ?? null) ?? cleanId(m.inReplyTo) ?? cleanId(m.messageId);
  if (root) return root.slice(0, 300);
  return `subject:${normalizeSubject(m.subject ?? '')}`.slice(0, 300);
}

export type Address = { address: string; name?: string };

/** mailparser's address objects (single, list, or groups) → a flat list of { address, name }. */
export function flattenAddresses(v: unknown, max = 50): Address[] {
  const out: Address[] = [];
  const visit = (x: unknown) => {
    if (!x || out.length >= max) return;
    if (Array.isArray(x)) { x.forEach(visit); return; }
    const o = x as { value?: unknown; address?: unknown; name?: unknown; group?: unknown };
    if (Array.isArray(o.value)) { o.value.forEach(visit); return; }
    if (Array.isArray(o.group)) { o.group.forEach(visit); return; }
    if (typeof o.address === 'string' && o.address.includes('@')) {
      out.push({ address: o.address.trim().toLowerCase().slice(0, 254), ...(typeof o.name === 'string' && o.name.trim() ? { name: o.name.trim().slice(0, 120) } : {}) });
    }
  };
  visit(v);
  return out;
}

/** The stored address list (Json) back into addresses — tolerant of anything unexpected. */
export function readAddresses(json: unknown): Address[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((x) => {
    const o = x as { address?: unknown; name?: unknown };
    return typeof o?.address === 'string' ? [{ address: o.address, ...(typeof o.name === 'string' ? { name: o.name } : {}) }] : [];
  });
}

export function addressLabel(a: Address): string {
  return a.name ? `${a.name} <${a.address}>` : a.address;
}
