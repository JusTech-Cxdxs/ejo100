import 'server-only';
import { simpleParser } from 'mailparser';
import { prisma } from '@ejo/database';
import { ACCOUNT_SECRET_SELECT, connectionSettings, withinLimit } from './account';
import { closeImap, openImap, withTimeout } from './transport';
import { FOLDER } from './sync';

/**
 * One attachment of one of the signed-in person's own messages, fetched from
 * their mail server only when they ask for it (nothing is kept here).
 * The caller has already identified the person; this checks the message is
 * theirs, inside their organisation.
 */
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

export class AttachmentError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Pictures open in the browser; everything else (PDFs included) downloads — nothing ever runs as a page. */
export function safeContentType(type: string | undefined, name: string): { type: string; inline: boolean } {
  const t = (type ?? '').toLowerCase().split(';')[0]!.trim();
  if (/^image\/(png|jpe?g|gif|webp|bmp)$/.test(t)) return { type: t, inline: true };
  if (t === 'application/pdf' || /\.pdf$/i.test(name)) return { type: 'application/pdf', inline: false };
  return { type: 'application/octet-stream', inline: false };
}

/** "Invoice 12.pdf" → a header-safe file name (ASCII fallback plus UTF-8). */
export function contentDisposition(name: string, inline: boolean): string {
  const clean = name.replace(/[\r\n"\\/]/g, '_').slice(0, 180) || 'attachment';
  const ascii = clean.replace(/[^\x20-\x7e]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

export async function fetchMyAttachment(o: { userId: string; organisationId: string | null; messageId: string; index: number }): Promise<{ name: string; type: string; inline: boolean; content: Buffer }> {
  if (!Number.isInteger(o.index) || o.index < 0 || o.index > 100) throw new AttachmentError('That attachment does not exist.', 404);
  if (!withinLimit(`mail-attachment:${o.userId}`, 30, 10 * 60_000)) throw new AttachmentError('Too many downloads in a short time. Wait a few minutes and try again.', 429);
  const msg = await prisma.mailMessage.findFirst({
    where: { id: o.messageId, folder: FOLDER, account: { userId: o.userId, status: { not: 'DISCONNECTED' }, ...(o.organisationId ? { organisationId: o.organisationId } : {}) } },
    select: { uid: true, accountId: true },
  });
  if (!msg) throw new AttachmentError('This message is not available.', 404);
  const account = await prisma.mailAccount.findUnique({ where: { id: msg.accountId }, select: ACCOUNT_SECRET_SELECT });
  if (!account) throw new AttachmentError('This message is not available.', 404);
  const { imap } = connectionSettings(account);
  const client = await openImap(imap);
  try {
    const lock = await client.getMailboxLock(FOLDER, { readOnly: true });
    try {
      const meta = await withTimeout(client.fetchOne(String(msg.uid), { size: true }, { uid: true }), 15_000, 'size');
      if (!meta) throw new AttachmentError('This message is no longer on the mail server.', 404);
      if ((meta.size ?? 0) > ATTACHMENT_MAX_BYTES) throw new AttachmentError('This message is too large to download here. Open it in your mail app.', 413);
      const full = await withTimeout(client.fetchOne(String(msg.uid), { source: true }, { uid: true }), 45_000, 'download');
      if (!full || !full.source) throw new AttachmentError('This message is no longer on the mail server.', 404);
      const parsed = await simpleParser(full.source, { skipImageLinks: true, skipTextToHtml: true, skipTextLinks: true });
      // The same list, in the same order, as the one shown under the message (lib/mail/sync.ts).
      const list = (parsed.attachments ?? []).filter((a) => !(a.related && a.contentDisposition === 'inline'));
      const a = list[o.index];
      if (!a) throw new AttachmentError('That attachment does not exist.', 404);
      const name = (a.filename || 'attachment').slice(0, 200);
      const { type, inline } = safeContentType(a.contentType, name);
      return { name, type, inline, content: a.content as Buffer };
    } finally {
      lock.release();
    }
  } finally {
    await closeImap(client);
  }
}
