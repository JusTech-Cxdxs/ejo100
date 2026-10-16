import { prisma } from '@ejo/database';
import { simpleParser } from 'mailparser';
import type { ImapFlow } from 'imapflow';
import { logFailure } from '@/lib/log';
import { ACCOUNT_SECRET_SELECT, connectionSettings } from './account';
import { closeImap, MailConnectError, openImap, withTimeout } from './transport';
import { cleanBody, flattenAddresses, snippetOf, threadKeyOf, withAttachments, type AttachmentInfo } from './parse-core';
import { MailCryptoError } from './crypto';
import { sanitizeMailHtml } from './html';
import { htmlToText } from '@/lib/email-templates/layout';
import { briefNewMessages } from './brief';

/**
 * Reading a person's INBOX into MailMessage rows. Server-only.
 *
 *  • First time: the last 30 days, at most 300 messages.
 *  • Then: only messages with a higher UID than the newest stored one,
 *    oldest first, so a run cut short by its time limit simply continues
 *    next time.
 *  • Seen / flagged changes made in another mail app are copied back for the
 *    stored messages, and messages deleted on the server are removed here.
 *  • The text, and the email's own layout cleaned by lib/mail/html.ts (no
 *    scripts, remote pictures held back); attachments are listed by name and
 *    size here and fetched from the server only when the owner downloads one.
 *
 * Two syncs of one mailbox never run together: each claims the mailbox by
 * moving `lastSyncAt` forward in one conditional update (only one instance
 * can win), and a claim is refused while the last one is younger than the
 * minimum gap. Failures are stored as a plain message (`lastError`) with
 * status ERROR — never the library's text, never the password.
 */

export const FOLDER = 'INBOX';
const FIRST_SYNC_DAYS = 30;
const FIRST_SYNC_MAX = 300;
const PER_RUN_MAX = 150;
const FETCH_CHUNK = 20;
const SOURCE_MAX_BYTES = 2_500_000;
const FLAG_WINDOW = 400;
export const RETENTION_DAYS = 90;

export type SyncResult = { status: 'synced' | 'skipped' | 'error'; added: number; message?: string };

/** Claim the mailbox for one sync. False when another sync started less than `minGapMs` ago. */
async function claim(accountId: string, minGapMs: number, now: Date): Promise<boolean> {
  const r = await prisma.mailAccount.updateMany({
    where: { id: accountId, status: { not: 'DISCONNECTED' }, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(now.getTime() - minGapMs) } }] },
    data: { lastSyncAt: now },
  });
  return r.count === 1;
}

function plainFailure(err: unknown): string {
  if (err instanceof MailConnectError) return err.message.startsWith('timeout:') ? 'The mail server did not answer in time. It will be tried again shortly.' : err.message;
  if (err instanceof MailCryptoError) return 'The saved password could not be read. Connect the mailbox again.';
  return 'The mailbox could not be read just now. It will be tried again shortly.';
}

type Fetched = { uid: number; flags: Set<string>; internalDate: Date | null; source: Buffer | null; size: number };
export async function parseOne(f: Fetched, accountId: string) {
  const parsed = f.source ? await simpleParser(f.source, { skipImageLinks: true, skipTextToHtml: true, skipTextLinks: true, maxHtmlLengthToParse: 1_500_000 }) : null;
  // A very large message: only its headers were fetched.
  const tooLarge = f.size > SOURCE_MAX_BYTES;
  const from = flattenAddresses(parsed?.from)[0];
  const to = flattenAddresses(parsed?.to);
  const cc = flattenAddresses(parsed?.cc);
  // An email sent only as HTML still gets its words as text (search, the snippet, Enyo's brief, plain view).
  const plainFromHtml = !parsed?.text?.trim() && typeof parsed?.html === 'string'
    ? htmlToText(parsed.html.slice(0, 1_500_000).replace(/<(style|script|title)\b[\s\S]*?<\/\1>/gi, ''))
    : '';
  const text = tooLarge
    ? `This message is too large to show here (${(f.size / 1_048_576).toFixed(1)} MB). Open it in your mail app to read it.`
    : cleanBody(parsed?.text?.trim() ? parsed.text : plainFromHtml);
  const attachments: AttachmentInfo[] = (parsed?.attachments ?? [])
    .filter((a) => !(a.related && a.contentDisposition === 'inline'))
    .map((a) => ({ name: (a.filename || 'attachment').slice(0, 200), size: a.size ?? 0 }));
  // The email's own layout, cleaned; its inline pictures travel with it.
  const cleaned = tooLarge || typeof parsed?.html !== 'string'
    ? null
    : sanitizeMailHtml(parsed.html, (parsed?.attachments ?? []).filter((a) => a.cid && a.content).map((a) => ({ cid: a.cid!, contentType: a.contentType ?? '', content: a.content as Buffer })));
  const internal = f.internalDate && !Number.isNaN(f.internalDate.getTime()) ? f.internalDate : null;
  const headerDate = parsed?.date && !Number.isNaN(parsed.date.getTime()) ? parsed.date : null;
  // A date header far in the future is not trusted (spam does this to stay on top).
  const receivedAt = headerDate && headerDate.getTime() < Date.now() + 86_400_000 ? headerDate : internal ?? new Date();
  const subject = (parsed?.subject ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 500) || '(no subject)';
  const messageId = parsed?.messageId?.slice(0, 300) ?? null;
  const inReplyTo = parsed?.inReplyTo?.slice(0, 300) ?? null;
  return {
    accountId,
    folder: FOLDER,
    uid: f.uid,
    messageId,
    inReplyTo,
    threadKey: threadKeyOf({ messageId, inReplyTo, references: parsed?.references ?? null, subject }),
    fromAddress: from?.address ?? 'unknown',
    fromName: from?.name ?? null,
    toList: to as unknown as object,
    ccList: cc.length ? (cc as unknown as object) : undefined,
    subject,
    snippet: snippetOf(text),
    bodyText: withAttachments(text, attachments),
    // '' = looked at, no layout to show (so older messages can be told apart: null).
    bodyHtml: cleaned?.html ?? '',
    receivedAt,
    seen: f.flags.has('\\Seen'),
    flagged: f.flags.has('\\Flagged'),
    hasAttachments: attachments.length > 0 || tooLarge,
  };
}

/**
 * Sizes first (cheap), then the full message for those within the limit, and
 * only the headers for the rest. Each fetch stream is read to the end before
 * the next command.
 */
export async function fetchChunk(client: ImapFlow, uids: number[]): Promise<Fetched[]> {
  const meta = new Map<number, { flags: Set<string>; internalDate: Date | null; size: number }>();
  for await (const m of client.fetch(uids, { uid: true, flags: true, internalDate: true, size: true }, { uid: true })) {
    meta.set(m.uid, { flags: m.flags ?? new Set(), internalDate: m.internalDate ? new Date(m.internalDate) : null, size: m.size ?? 0 });
  }
  const small = [...meta.entries()].filter(([, x]) => x.size <= SOURCE_MAX_BYTES).map(([u]) => u);
  const large = [...meta.entries()].filter(([, x]) => x.size > SOURCE_MAX_BYTES).map(([u]) => u);
  const sources = new Map<number, Buffer>();
  if (small.length) for await (const m of client.fetch(small, { uid: true, source: true }, { uid: true })) if (m.source) sources.set(m.uid, m.source);
  if (large.length) for await (const m of client.fetch(large, { uid: true, headers: true }, { uid: true })) if (m.headers) sources.set(m.uid, Buffer.concat([m.headers, Buffer.from('\r\n')]));
  return [...meta.entries()].map(([uid, x]) => ({ uid, ...x, source: sources.get(uid) ?? null }));
}

async function readInbox(client: ImapFlow, accountId: string, deadline: number): Promise<{ added: string[] }> {
  const lock = await client.getMailboxLock(FOLDER, { readOnly: true });
  const added: string[] = [];
  try {
    const box = client.mailbox && typeof client.mailbox === 'object' ? client.mailbox : null;
    const uidNext = box?.uidNext ?? 0;
    const newest = await prisma.mailMessage.findFirst({ where: { accountId, folder: FOLDER }, orderBy: { uid: 'desc' }, select: { uid: true } });
    let maxUid = newest?.uid ?? 0;
    // The server renumbered the mailbox (UIDVALIDITY changed): start again.
    if (maxUid && uidNext && maxUid >= uidNext) {
      await prisma.mailMessage.deleteMany({ where: { accountId, folder: FOLDER } });
      maxUid = 0;
    }
    let uids: number[];
    if (!maxUid) {
      const found = await client.search({ since: new Date(Date.now() - FIRST_SYNC_DAYS * 86_400_000) }, { uid: true });
      uids = (Array.isArray(found) ? found : []).sort((a, b) => a - b).slice(-FIRST_SYNC_MAX);
    } else {
      const found = await client.search({ uid: `${maxUid + 1}:*` }, { uid: true });
      uids = (Array.isArray(found) ? found : []).filter((u) => u > maxUid).sort((a, b) => a - b).slice(0, PER_RUN_MAX);
    }
    for (let i = 0; i < uids.length && Date.now() < deadline; i += FETCH_CHUNK) {
      const chunk = await fetchChunk(client, uids.slice(i, i + FETCH_CHUNK));
      const rows = [];
      for (const f of chunk.sort((a, b) => a.uid - b.uid)) {
        try {
          rows.push(await parseOne(f, accountId));
        } catch {
          // A message the parser cannot read is kept as a placeholder, never retried forever.
          rows.push({ accountId, folder: FOLDER, uid: f.uid, fromAddress: 'unknown', toList: [], subject: '(this message could not be read)', snippet: '', bodyText: '', receivedAt: f.internalDate ?? new Date(), seen: f.flags.has('\\Seen'), flagged: f.flags.has('\\Flagged'), hasAttachments: false });
        }
      }
      if (rows.length) {
        await prisma.mailMessage.createMany({ data: rows as never, skipDuplicates: true });
        const ids = await prisma.mailMessage.findMany({ where: { accountId, folder: FOLDER, uid: { in: rows.map((r) => r.uid) } }, select: { id: true } });
        added.push(...ids.map((r: { id: string }) => r.id));
      }
    }
    if (Date.now() < deadline) await refreshFlags(client, accountId);
    if (Date.now() < deadline - 4_000) await backfillLayouts(client, accountId, deadline - 2_000);
  } finally {
    lock.release();
  }
  return { added };
}

/**
 * Messages stored before Mail kept each email's own layout (bodyHtml null):
 * a few at a time, newest first, read again so they show with their pictures
 * and a clean text. '' marks "looked at, nothing to show", so none is read twice.
 */
const BACKFILL_PER_RUN = 15;
const BACKFILL_GROUP = 5;
async function backfillLayouts(client: ImapFlow, accountId: string, deadline: number): Promise<void> {
  // Best effort: never fails or delays the sync it runs inside.
  try {
    const todo = await prisma.mailMessage.findMany({ where: { accountId, folder: FOLDER, bodyHtml: null }, orderBy: { receivedAt: 'desc' }, take: BACKFILL_PER_RUN, select: { id: true, uid: true } });
    for (let i = 0; i < todo.length; i += BACKFILL_GROUP) {
      if (Date.now() > deadline - 1_500) return;
      const group = todo.slice(i, i + BACKFILL_GROUP) as { id: string; uid: number }[];
      const byUid = new Map(group.map((t) => [t.uid, t.id]));
      const fetched = await fetchChunk(client, [...byUid.keys()]);
      for (const f of fetched) {
        const id = byUid.get(f.uid);
        if (!id) continue;
        byUid.delete(f.uid);
        try {
          const row = await parseOne(f, accountId);
          await prisma.mailMessage.update({ where: { id }, data: { bodyHtml: row.bodyHtml, bodyText: row.bodyText, snippet: row.snippet } });
        } catch {
          await prisma.mailMessage.update({ where: { id }, data: { bodyHtml: '' } }).catch(() => undefined);
        }
      }
      // The whole group was fetched: anything not returned is gone from the server.
      if (byUid.size) await prisma.mailMessage.updateMany({ where: { id: { in: [...byUid.values()] }, bodyHtml: null }, data: { bodyHtml: '' } });
    }
  } catch (err) {
    logFailure('Mail layout backfill failed', err);
  }
}

/** Seen / flagged changes made elsewhere, and messages deleted on the server. */
async function refreshFlags(client: ImapFlow, accountId: string): Promise<void> {
  const stored = await prisma.mailMessage.findMany({ where: { accountId, folder: FOLDER }, orderBy: { uid: 'desc' }, take: FLAG_WINDOW, select: { id: true, uid: true, seen: true, flagged: true } });
  if (!stored.length) return;
  const lo = Math.min(...stored.map((s: { uid: number }) => s.uid));
  const hi = Math.max(...stored.map((s: { uid: number }) => s.uid));
  const server = new Map<number, Set<string>>();
  for await (const m of client.fetch(`${lo}:${hi}`, { uid: true, flags: true }, { uid: true })) server.set(m.uid, m.flags ?? new Set());
  const gone: string[] = [];
  const updates: Promise<unknown>[] = [];
  for (const s of stored) {
    const f = server.get(s.uid);
    if (!f) { gone.push(s.id); continue; }
    const seen = f.has('\\Seen');
    const flagged = f.has('\\Flagged');
    if (seen !== s.seen || flagged !== s.flagged) updates.push(prisma.mailMessage.update({ where: { id: s.id }, data: { seen, flagged } }));
    if (updates.length >= 100) break;
  }
  await Promise.all(updates);
  // Removed on the server (deleted or moved to another folder): removed here too.
  if (gone.length && gone.length < stored.length) await prisma.mailMessage.deleteMany({ where: { id: { in: gone.slice(0, 200) } } });
}

/**
 * Sync one mailbox. `minGapMs`: skip when the last sync began more recently.
 * `timeoutMs`: the whole run, connection included.
 */
export async function syncAccount(accountId: string, opts: { minGapMs: number; timeoutMs: number; brief?: boolean }): Promise<SyncResult> {
  const now = new Date();
  if (!(await claim(accountId, opts.minGapMs, now))) return { status: 'skipped', added: 0 };
  const deadline = now.getTime() + opts.timeoutMs;
  const account = await prisma.mailAccount.findUnique({ where: { id: accountId }, select: { ...ACCOUNT_SECRET_SELECT, organisationId: true, aiConsentAt: true } });
  if (!account) return { status: 'skipped', added: 0 };
  let client: ImapFlow | null = null;
  try {
    const { imap } = connectionSettings(account);
    client = await openImap(imap, Math.min(20_000, opts.timeoutMs));
    // Leave a little time to close the connection and write the result.
    const { added } = await withTimeout(readInbox(client, accountId, deadline - 3_000), Math.max(1_000, deadline - Date.now()), 'sync');
    await prisma.mailAccount.updateMany({ where: { id: accountId, status: { not: 'DISCONNECTED' } }, data: { status: 'ACTIVE', lastError: null } });
    if (opts.brief !== false && added.length && account.aiConsentAt && Date.now() < deadline - 2_000) {
      await briefNewMessages(account.organisationId, accountId, added, deadline).catch((err) => logFailure('Mail brief failed', err));
    }
    return { status: 'synced', added: added.length };
  } catch (err) {
    const message = plainFailure(err);
    if (!(err instanceof MailConnectError) && !(err instanceof MailCryptoError)) logFailure('Mailbox sync failed', err);
    await prisma.mailAccount.updateMany({ where: { id: accountId, status: { not: 'DISCONNECTED' } }, data: { status: 'ERROR', lastError: message } }).catch(() => undefined);
    return { status: 'error', added: 0, message };
  } finally {
    if (client) await closeImap(client);
  }
}

/**
 * The 10-minute job: mailboxes of people who used the portal in the last 7
 * days, least recently synced first, within a total time budget.
 */
export async function syncDueMailboxes(opts: { budgetMs?: number; perAccountMs?: number; max?: number } = {}): Promise<{ synced: number; skipped: number; failed: number; added: number }> {
  const budget = opts.budgetMs ?? 25_000;
  const start = Date.now();
  const out = { synced: 0, skipped: 0, failed: 0, added: 0 };
  const candidates = await prisma.mailAccount.findMany({
    where: { status: { not: 'DISCONNECTED' }, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(Date.now() - 8 * 60_000) } }] },
    orderBy: { lastSyncAt: { sort: 'asc', nulls: 'first' } },
    take: 200,
    select: { id: true, userId: true },
  });
  if (!candidates.length) return out;
  const active = await prisma.session.findMany({
    where: { userId: { in: [...new Set(candidates.map((c: { userId: string }) => c.userId))] }, updatedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    select: { userId: true },
    distinct: ['userId'],
  });
  const recent = new Set(active.map((s: { userId: string }) => s.userId));
  const due = candidates.filter((c: { userId: string }) => recent.has(c.userId)).slice(0, opts.max ?? 25);
  for (const c of due) {
    const left = budget - (Date.now() - start);
    if (left < 5_000) break;
    const r = await syncAccount(c.id, { minGapMs: 8 * 60_000, timeoutMs: Math.min(opts.perAccountMs ?? 20_000, left) }).catch(() => ({ status: 'error' as const, added: 0 }));
    if (r.status === 'synced') out.synced += 1;
    else if (r.status === 'skipped') out.skipped += 1;
    else out.failed += 1;
    out.added += r.added;
  }
  return out;
}

/** Retention: stored copies older than 90 days are removed (the mailbox itself keeps them). */
export async function purgeOldMailMessages(now: Date = new Date()): Promise<number> {
  const r = await prisma.mailMessage.deleteMany({ where: { receivedAt: { lt: new Date(now.getTime() - RETENTION_DAYS * 86_400_000) } } });
  return r.count;
}
