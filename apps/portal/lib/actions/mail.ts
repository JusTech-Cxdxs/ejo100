'use server';

import { after } from 'next/server';
import { prisma, Prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { myOrganisationId, refuseDuringAssist } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { logFailure } from '@/lib/log';
import { enyoReady } from '@/lib/enyo/settings';
import { mailAllowInsecure, mailKey, NOT_SET_UP } from '@/lib/mail/config';
import { encryptSecret, secretAad } from '@/lib/mail/crypto';
import { ACCOUNT_SECRET_SELECT, connectionSettings, withinLimit } from '@/lib/mail/account';
import { closeImap, MailConnectError, openImap, smtpTransport, testMailbox, withTimeout } from '@/lib/mail/transport';
import { syncAccount, FOLDER } from '@/lib/mail/sync';
import { BODY_MAX, parseAddressList, SUBJECT_MAX, validateConnect } from '@/lib/mail/rules';
import { readAddresses, splitAttachments, type Address, type AttachmentInfo } from '@/lib/mail/parse-core';
import { readActions, readRefs, type MailAction, type MailCategory } from '@/lib/mail/brief-core';
import { resolveMailRefs, type ResolvedRef } from '@/lib/mail/refs';
import { suspiciousEmail } from '@/lib/mail/brief';

/**
 * The person's OWN work mailbox. Every action here works only on the
 * mailbox of the signed-in person (looked up by their user id inside their
 * organisation) — there is no way, for anyone, administrators included, to
 * open another person's mail. During an assisted session every action is
 * refused: an assistant never sees a colleague's mail.
 *
 * The password is encrypted before it is stored and is never returned,
 * logged or put in an audit entry. Message bodies are never audited.
 */

class MailError extends Error {}

type Me = { id: string; organisationId: string | null };

async function me(): Promise<Me> {
  await refuseDuringAssist('mail');
  const user = await requireUser();
  return { id: user.id, organisationId: await myOrganisationId() };
}

/** The signed-in person's mailbox (inside their organisation), or null. */
async function myMailbox(m: Me) {
  return prisma.mailAccount.findFirst({
    where: { userId: m.id, ...(m.organisationId ? { organisationId: m.organisationId } : {}), status: { not: 'DISCONNECTED' } },
    select: { id: true, address: true, displayName: true, imapHost: true, imapPort: true, imapSecure: true, smtpHost: true, smtpPort: true, smtpSecure: true, username: true, aiConsentAt: true, status: true, lastSyncAt: true, lastError: true, createdAt: true },
  });
}

/** One of the signed-in person's own messages — or "not available". */
async function myMessage(m: Me, id: string) {
  const box = await myMailbox(m);
  const msg = box && typeof id === 'string' && id ? await prisma.mailMessage.findFirst({ where: { id, accountId: box.id } }) : null;
  if (!box || !msg) throw new MailError('This message is not available. It may have been removed from your mailbox.');
  return { box, msg };
}

export type MailboxView = {
  feature: 'not_set_up' | 'ready';
  account: null | {
    address: string;
    displayName: string | null;
    imapHost: string;
    imapPort: number;
    imapSecurity: 'tls' | 'starttls' | 'none';
    smtpHost: string;
    smtpPort: number;
    smtpSecurity: 'tls' | 'starttls' | 'none';
    username: string;
    status: 'ACTIVE' | 'ERROR' | 'DISCONNECTED';
    lastSyncAt: Date | null;
    lastError: string | null;
    aiConsent: boolean;
    aiConsentAt: Date | null;
    connectedAt: Date;
  };
  /** Enyo for email is switched on for the organisation and a model is configured. */
  aiAvailable: boolean;
  allowInsecure: boolean;
};

/** The person's mailbox settings (never the password). */
export async function getMyMailbox(): Promise<MailboxView> {
  const m = await me();
  const ai = await enyoReady(m.organisationId, 'mailAi');
  if (!mailKey()) return { feature: 'not_set_up', account: null, aiAvailable: ai.ready, allowInsecure: false };
  const box = await myMailbox(m);
  const insecure = mailAllowInsecure();
  const sec = (s: boolean): 'tls' | 'starttls' | 'none' => (s ? 'tls' : insecure ? 'none' : 'starttls');
  return {
    feature: 'ready',
    aiAvailable: ai.ready,
    allowInsecure: insecure,
    account: box ? {
      address: box.address, displayName: box.displayName, imapHost: box.imapHost, imapPort: box.imapPort, imapSecurity: sec(box.imapSecure),
      smtpHost: box.smtpHost, smtpPort: box.smtpPort, smtpSecurity: sec(box.smtpSecure), username: box.username, status: box.status,
      lastSyncAt: box.lastSyncAt, lastError: box.lastError, aiConsent: Boolean(box.aiConsentAt), aiConsentAt: box.aiConsentAt, connectedAt: box.createdAt,
    } : null,
  };
}

/**
 * Connect (or reconnect after a password change): checks the settings,
 * signs in to both servers, and only then saves — the password encrypted.
 */
export async function connectMailbox(input: Record<string, unknown>): Promise<{ created: boolean }> {
  const m = await me();
  const key = mailKey();
  if (!key) throw new MailError(NOT_SET_UP);
  if (!m.organisationId) throw new MailError('Your account is not linked to an organisation yet. Ask your administrator.');
  const v = validateConnect(input ?? {}, { allowInsecure: mailAllowInsecure() });
  if (!v.ok) throw new MailError(v.message);
  const s = v.value;
  // Each test signs in to the person's mail servers: a few tries per 10 minutes.
  if (!withinLimit(`mail-connect:${m.id}`, 8, 10 * 60_000)) throw new MailError('Too many connection attempts. Wait ten minutes, then try again.');
  const existing = await myMailbox(m);
  if (existing && existing.address !== s.address) throw new MailError(`You already have ${existing.address} connected. Disconnect it first to connect another mailbox.`);
  try {
    await testMailbox(
      { host: s.imapHost, port: s.imapPort, security: s.imapSecurity, username: s.username, password: s.password },
      { host: s.smtpHost, port: s.smtpPort, security: s.smtpSecurity, username: s.username, password: s.password },
    );
  } catch (err) {
    if (err instanceof MailConnectError) throw new MailError(err.message);
    logFailure('Mailbox connection test failed', err);
    throw new MailError('The connection could not be checked just now. Please try again.');
  }
  const secret = encryptSecret(s.password, key, secretAad(m.id, s.address));
  const data = {
    displayName: s.displayName || null, imapHost: s.imapHost, imapPort: s.imapPort, imapSecure: s.imapSecurity === 'tls',
    smtpHost: s.smtpHost, smtpPort: s.smtpPort, smtpSecure: s.smtpSecurity === 'tls', username: s.username, secret, status: 'ACTIVE' as const, lastError: null,
  };
  const row = existing
    ? await prisma.mailAccount.update({ where: { id: existing.id }, data, select: { id: true } })
    : await prisma.mailAccount.create({ data: { ...data, organisationId: m.organisationId, userId: m.id, address: s.address }, select: { id: true } });
  await writeAuditLog({ userId: m.id, action: existing ? 'mailbox.reconnected' : 'mailbox.connected', entityType: 'MailAccount', entityId: row.id, metadata: { domain: s.address.split('@')[1], imapHost: s.imapHost, smtpHost: s.smtpHost } });
  return { created: !existing };
}

/** "Allow Enyo to read, sort and summarise your email?" — yes, no, or withdraw. Withdrawing deletes every summary. */
export async function setMailConsent(allow: boolean): Promise<void> {
  const m = await me();
  const box = await myMailbox(m);
  if (!box) throw new MailError('Connect your mailbox first.');
  if (allow === true) {
    if (box.aiConsentAt) return;
    await prisma.mailAccount.update({ where: { id: box.id }, data: { aiConsentAt: new Date() } });
    await writeAuditLog({ userId: m.id, action: 'mailbox.ai_consent_given', entityType: 'MailAccount', entityId: box.id });
    return;
  }
  await prisma.mailAccount.update({ where: { id: box.id }, data: { aiConsentAt: null } });
  await prisma.mailMessage.updateMany({ where: { accountId: box.id }, data: { aiSummary: null, aiCategory: null, aiPriority: null, aiActions: Prisma.DbNull, linkedRefs: Prisma.DbNull, aiAt: null } });
  await writeAuditLog({ userId: m.id, action: box.aiConsentAt ? 'mailbox.ai_consent_withdrawn' : 'mailbox.ai_consent_declined', entityType: 'MailAccount', entityId: box.id });
}

/** Disconnect: the mailbox settings, the encrypted password and every stored message are deleted. Nothing changes in the mailbox itself. */
export async function disconnectMailbox(): Promise<void> {
  const m = await me();
  const box = await myMailbox(m);
  if (!box) return;
  const removed = await prisma.mailMessage.deleteMany({ where: { accountId: box.id } });
  await prisma.mailAccount.delete({ where: { id: box.id } });
  await writeAuditLog({ userId: m.id, action: 'mailbox.disconnected', entityType: 'MailAccount', entityId: box.id, metadata: { domain: box.address.split('@')[1], messagesRemoved: removed.count } });
}

/** Fetch new mail now. "open": when /mail is opened (at most once a minute); "refresh": the Refresh button. */
export async function syncMyMailbox(reason: 'open' | 'refresh' = 'open'): Promise<{ status: 'synced' | 'skipped' | 'error' | 'none'; added: number; message?: string }> {
  const m = await me();
  if (!mailKey()) return { status: 'none', added: 0 };
  const box = await myMailbox(m);
  if (!box) return { status: 'none', added: 0 };
  return syncAccount(box.id, { minGapMs: reason === 'refresh' ? 15_000 : 60_000, timeoutMs: 25_000 });
}

export type MailView = 'inbox' | 'unread' | 'flagged' | 'today';
export type MailListItem = {
  id: string; fromName: string | null; fromAddress: string; subject: string; snippet: string; receivedAt: Date; seen: boolean; flagged: boolean;
  hasAttachments: boolean; aiSummary: string | null; aiPriority: number | null; aiCategory: MailCategory | null;
};
export type MailCounts = { all: number; unread: number; flagged: number; today: number };

const LIST_SELECT = { id: true, fromName: true, fromAddress: true, subject: true, snippet: true, receivedAt: true, seen: true, flagged: true, hasAttachments: true, aiSummary: true, aiPriority: true, aiCategory: true } as const;

/** The person's messages: a view, an optional search, newest first (60 at a time). */
export async function listMyMail(opts: { view?: MailView; q?: string; before?: string } = {}): Promise<{ items: MailListItem[]; counts: MailCounts; more: boolean }> {
  const m = await me();
  const box = await myMailbox(m);
  if (!box) return { items: [], counts: { all: 0, unread: 0, flagged: 0, today: 0 }, more: false };
  const base = { accountId: box.id, folder: FOLDER };
  const q = typeof opts.q === 'string' ? opts.q.trim().slice(0, 100) : '';
  const before = typeof opts.before === 'string' && !Number.isNaN(Date.parse(opts.before)) ? new Date(opts.before) : null;
  const view: MailView = ['unread', 'flagged', 'today'].includes(opts.view as string) ? (opts.view as MailView) : 'inbox';
  const viewWhere = view === 'unread' ? { seen: false } : view === 'flagged' ? { flagged: true } : view === 'today' ? TODAY : {};
  const search = q ? { OR: ['subject', 'fromAddress', 'fromName', 'snippet', 'bodyText', 'aiSummary'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' as const } })) } : {};
  const [rows, all, unread, flagged, today] = await Promise.all([
    prisma.mailMessage.findMany({ where: { ...base, AND: [viewWhere, search, before ? { receivedAt: { lt: before } } : {}] }, orderBy: { receivedAt: 'desc' }, take: 61, select: LIST_SELECT }),
    prisma.mailMessage.count({ where: base }),
    prisma.mailMessage.count({ where: { ...base, seen: false } }),
    prisma.mailMessage.count({ where: { ...base, flagged: true } }),
    prisma.mailMessage.count({ where: { ...base, ...TODAY } }),
  ]);
  return { items: rows.slice(0, 60).map(listItem), counts: { all, unread, flagged, today }, more: rows.length > 60 };
}

/** "Needs you today": Enyo's priority 1 that is still unread, or anything flagged. */
const TODAY = { OR: [{ aiPriority: 1, seen: false }, { flagged: true, seen: false }] };

function listItem(r: { id: string; fromName: string | null; fromAddress: string; subject: string; snippet: string; receivedAt: Date; seen: boolean; flagged: boolean; hasAttachments: boolean; aiSummary: string | null; aiPriority: number | null; aiCategory: string | null }): MailListItem {
  return {
    id: r.id, fromName: r.fromName, fromAddress: r.fromAddress, subject: r.subject, snippet: r.snippet, receivedAt: r.receivedAt, seen: r.seen, flagged: r.flagged,
    hasAttachments: r.hasAttachments, aiSummary: r.aiSummary, aiPriority: r.aiPriority, aiCategory: (r.aiCategory as MailCategory | null) ?? null,
  };
}

export type MailDetail = MailListItem & {
  to: Address[]; cc: Address[]; body: string; attachments: AttachmentInfo[]; suspicious: boolean;
  brief: null | { summary: string; category: MailCategory | null; priority: number | null; refs: ResolvedRef[]; actions: (MailAction & { href: string })[] };
  thread: { id: string; fromName: string | null; fromAddress: string; receivedAt: Date; snippet: string }[];
};

/** Opens one of the person's messages (marks it read here and, in the background, on the mail server). */
export async function readMyMessage(id: string): Promise<MailDetail> {
  const m = await me();
  const { box, msg } = await myMessage(m, id);
  if (!msg.seen) {
    await prisma.mailMessage.update({ where: { id: msg.id }, data: { seen: true } });
    pushFlags(box.id, msg.uid, { seen: true });
  }
  const { body, attachments } = splitAttachments(msg.bodyText);
  const thread = msg.threadKey
    ? await prisma.mailMessage.findMany({ where: { accountId: box.id, threadKey: msg.threadKey, NOT: { id: msg.id } }, orderBy: { receivedAt: 'desc' }, take: 20, select: { id: true, fromName: true, fromAddress: true, receivedAt: true, snippet: true } })
    : [];
  let brief: MailDetail['brief'] = null;
  if (box.aiConsentAt && msg.aiSummary) {
    const refs = await resolveMailRefs(readRefs(msg.linkedRefs));
    const actions = readActions(msg.aiActions).flatMap((a) => {
      if (a.kind === 'open') {
        const hit = refs.find((r) => r.value.toUpperCase() === (a.ref ?? '').toUpperCase());
        return hit ? [{ ...a, href: hit.href }] : [];
      }
      if (a.kind === 'reply') return [{ ...a, href: `/mail/compose?inReplyTo=${msg.id}` }];
      const q = new URLSearchParams({ title: `Follow up: ${msg.subject}`.slice(0, 160), notes: `Email from ${msg.fromName ?? msg.fromAddress}` });
      return [{ ...a, href: `/reminders/new?${q.toString()}` }];
    });
    brief = { summary: msg.aiSummary, category: (msg.aiCategory as MailCategory | null) ?? null, priority: msg.aiPriority, refs, actions };
  }
  return {
    ...listItem({ ...msg, seen: true }),
    to: readAddresses(msg.toList), cc: readAddresses(msg.ccList), body, attachments, suspicious: suspiciousEmail(body), brief, thread,
  };
}

/** Read / unread and flag, here and (in the background) on the mail server. */
export async function setMyMessageFlags(id: string, flags: { seen?: boolean; flagged?: boolean }): Promise<void> {
  const m = await me();
  const { box, msg } = await myMessage(m, id);
  const data: { seen?: boolean; flagged?: boolean } = {};
  if (typeof flags?.seen === 'boolean') data.seen = flags.seen;
  if (typeof flags?.flagged === 'boolean') data.flagged = flags.flagged;
  if (!Object.keys(data).length) return;
  await prisma.mailMessage.update({ where: { id: msg.id }, data });
  pushFlags(box.id, msg.uid, data);
}

/** Copies a flag change to the mail server after the response is sent. Best effort, short time limit. */
function pushFlags(accountId: string, uid: number, f: { seen?: boolean; flagged?: boolean; answered?: boolean }) {
  after(async () => {
    const account = await prisma.mailAccount.findUnique({ where: { id: accountId }, select: ACCOUNT_SECRET_SELECT });
    if (!account) return;
    let client: Awaited<ReturnType<typeof openImap>> | null = null;
    try {
      client = await openImap(connectionSettings(account).imap, 10_000);
      const lock = await withTimeout(client.getMailboxLock(FOLDER), 5_000, 'lock');
      try {
        const add: string[] = [];
        const remove: string[] = [];
        if (f.seen !== undefined) (f.seen ? add : remove).push('\\Seen');
        if (f.flagged !== undefined) (f.flagged ? add : remove).push('\\Flagged');
        if (f.answered) add.push('\\Answered');
        if (add.length) await withTimeout(client.messageFlagsAdd(String(uid), add, { uid: true }), 8_000, 'flags');
        if (remove.length) await withTimeout(client.messageFlagsRemove(String(uid), remove, { uid: true }), 8_000, 'flags');
      } finally {
        lock.release();
      }
    } catch {
      // The next sync copies the server's flags back; nothing else to do.
    } finally {
      if (client) await closeImap(client);
    }
  });
}

/** Sends through the person's own mail server. Nothing is stored here; the original is marked answered on the server. */
export async function sendMyMail(input: { to?: string; cc?: string; subject?: string; body?: string; inReplyTo?: string }): Promise<void> {
  const m = await me();
  const box = await myMailbox(m);
  if (!box) throw new MailError('Connect your mailbox first.');
  const to = parseAddressList(input?.to);
  const cc = parseAddressList(input?.cc);
  if (to.invalid.length || cc.invalid.length) throw new MailError(`Check this address: ${[...to.invalid, ...cc.invalid][0]}.`);
  if (!to.valid.length) throw new MailError('Add at least one recipient.');
  const subject = String(input?.subject ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, SUBJECT_MAX);
  if (!subject) throw new MailError('Add a subject.');
  const body = String(input?.body ?? '').replace(/\r\n?/g, '\n');
  if (!body.trim()) throw new MailError('Write a message first.');
  if (body.length > BODY_MAX) throw new MailError('This message is too long. Shorten it and try again.');
  if (!withinLimit(`mail-send:${m.id}`, 30, 10 * 60_000)) throw new MailError('You have sent a lot of messages in the last few minutes. Wait a little, then try again.');
  const original = input?.inReplyTo ? (await myMessage(m, input.inReplyTo)).msg : null;
  const account = await prisma.mailAccount.findUnique({ where: { id: box.id }, select: ACCOUNT_SECRET_SELECT });
  if (!account) throw new MailError('Connect your mailbox first.');
  let transport: Awaited<ReturnType<typeof smtpTransport>> | null = null;
  try {
    const { smtp } = connectionSettings(account);
    transport = await smtpTransport(smtp);
    const references = original ? [original.threadKey, original.messageId].filter((x): x is string => Boolean(x && x.startsWith('<'))).filter((x, i, a) => a.indexOf(x) === i) : [];
    await withTimeout(transport.sendMail({
      from: box.displayName ? { name: box.displayName, address: box.address } : box.address,
      to: to.valid,
      cc: cc.valid.length ? cc.valid : undefined,
      subject,
      text: body,
      ...(original?.messageId ? { inReplyTo: original.messageId, references } : {}),
    }), 30_000, 'send');
  } catch (err) {
    if (err instanceof MailConnectError) throw new MailError(`Not sent. ${err.message}`);
    const e = err as { code?: string; responseCode?: number };
    if (e?.code === 'EAUTH' || e?.responseCode === 535) throw new MailError('Not sent. Your mail server did not accept the saved password. Update it on the Mail settings page.');
    if (e?.code === 'EENVELOPE') throw new MailError('Not sent. The mail server refused one of the addresses. Check them and try again.');
    if (e?.code === 'ETIMEDOUT' || (err as Error)?.message?.startsWith('timeout:')) throw new MailError('Not sent. Your mail server did not answer in time. Please try again.');
    logFailure('Sending mail failed', { code: e?.code, responseCode: e?.responseCode });
    throw new MailError('Not sent. Your mail server refused the message. Please try again in a moment.');
  } finally {
    transport?.close();
  }
  if (original) pushFlags(box.id, original.uid, { answered: true });
}

/** Original message details for a reply or forward (own messages only). */
export async function getMessageForCompose(id: string): Promise<{ id: string; fromName: string | null; fromAddress: string; to: Address[]; cc: Address[]; subject: string; receivedAt: Date; body: string; hasAttachments: boolean; ownAddress: string }> {
  const m = await me();
  const { box, msg } = await myMessage(m, id);
  return { id: msg.id, fromName: msg.fromName, fromAddress: msg.fromAddress, to: readAddresses(msg.toList), cc: readAddresses(msg.ccList), subject: msg.subject, receivedAt: msg.receivedAt, body: splitAttachments(msg.bodyText).body, hasAttachments: msg.hasAttachments, ownAddress: box.address };
}

export type MailDigest = {
  connected: boolean;
  consent: boolean;
  aiAvailable: boolean;
  unread: number;
  needsYou: { id: string; subject: string; from: string; summary: string | null; receivedAt: Date; href: string }[];
  lastSyncAt: Date | null;
  status: 'ACTIVE' | 'ERROR' | 'DISCONNECTED' | null;
  lastError: string | null;
};

/** "Today's mail": unread count and what needs the person today. */
export async function getMyMailDigest(): Promise<MailDigest> {
  const m = await me();
  const box = mailKey() ? await myMailbox(m) : null;
  const ai = await enyoReady(m.organisationId, 'mailAi');
  if (!box) return { connected: false, consent: false, aiAvailable: ai.ready, unread: 0, needsYou: [], lastSyncAt: null, status: null, lastError: null };
  const base = { accountId: box.id, folder: FOLDER };
  const [unread, needs] = await Promise.all([
    prisma.mailMessage.count({ where: { ...base, seen: false } }),
    prisma.mailMessage.findMany({ where: { ...base, ...TODAY }, orderBy: [{ aiPriority: 'asc' }, { receivedAt: 'desc' }], take: 5, select: { id: true, subject: true, fromName: true, fromAddress: true, aiSummary: true, receivedAt: true } }),
  ]);
  return {
    connected: true, consent: Boolean(box.aiConsentAt), aiAvailable: ai.ready, unread, lastSyncAt: box.lastSyncAt, status: box.status, lastError: box.lastError,
    needsYou: needs.map((n: (typeof needs)[number]) => ({ id: n.id, subject: n.subject, from: n.fromName ?? n.fromAddress, summary: box.aiConsentAt ? n.aiSummary : null, receivedAt: n.receivedAt, href: `/mail?m=${n.id}` })),
  };
}
