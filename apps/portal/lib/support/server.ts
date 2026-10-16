import 'server-only';
/**
 * The Support centre's server side shared by the intake (email), the
 * scheduled automations and the colleagues' actions: settings and queues,
 * ticket numbers and targets, who picks a ticket up, Enyo's triage and
 * answers, and the emails sent from a support address.
 *
 * Organisation-fenced everywhere: every query carries the organisation.
 */
import { randomBytes } from 'node:crypto';
import { prisma, type Prisma } from '@ejo/database';
import { asData, complete } from '@ejo/enyo';
import { enyoReady } from '@/lib/enyo/settings';
import { retryOnNumberClash } from '@/lib/integrity-core';
import { sendEmail } from '@/lib/email';
import { portalBaseUrl, websiteBaseUrl } from '@/lib/portal-url';
import { logFailure } from '@/lib/log';
import { connectionSettings, type StoredAccount } from '@/lib/mail/account';
import { smtpTransport, withTimeout } from '@/lib/mail/transport';
import { htmlToText } from '@/lib/email-templates/layout';
import { PLATFORM } from '@/lib/brand';
import { findLearned } from '@/lib/enyo/learned';
import { EXAMPLE_MIN } from '@/lib/enyo/learned-core';
import {
  asAiMode, autoReplyHeaders, DEFAULT_HOURS, dueDates, newMessageId, pickAssignee, readHours, readTargets, taggedSubject, unknownContacts, unknownSpecifics,
  type AiMode, type Hours, type Priority, type Triage,
} from './core';
import { answerMessages, hoursSentence, parseAnswer, parseTriage, summaryMessages, triageMessages, type AiAnswer, type Knowledge } from './ai-core';
import { recordsReadyFor, senderFacts, SENDER_KIND_LABEL, type SenderContext } from './context-core';

// ─────────────────────────────────────────────────────────── settings & queues

export type SupportSettings = { hours: Hours; holidays: string[]; aiThreshold: number; nudgeAfterHours: number; autoResolveDays: number; closeAfterDays: number; csatEnabled: boolean };

export async function supportSettings(organisationId: string): Promise<SupportSettings> {
  const s = await prisma.supportSetting.findUnique({ where: { organisationId } }).catch(() => null);
  return {
    hours: s?.hours ? readHours(s.hours) : { ...DEFAULT_HOURS },
    holidays: (s?.holidays ?? []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    aiThreshold: Math.min(0.99, Math.max(0.5, s?.aiThreshold ?? 0.75)),
    nudgeAfterHours: Math.min(240, Math.max(12, s?.nudgeAfterHours ?? 48)),
    autoResolveDays: Math.min(30, Math.max(2, s?.autoResolveDays ?? 7)),
    closeAfterDays: Math.min(28, Math.max(1, s?.closeAfterDays ?? 4)),
    csatEnabled: s?.csatEnabled ?? true,
  };
}

export type QueueRow = { id: string; name: string; kind: string; aiMode: AiMode; autoAcknowledge: boolean; targets: ReturnType<typeof readTargets>; signature: string | null; branchId: string | null; isDefault: boolean };

const queueSelect = { id: true, name: true, kind: true, aiMode: true, autoAcknowledge: true, targets: true, signature: true, branchId: true, isDefault: true } as const;
const toQueue = (q: { id: string; name: string; kind: string; aiMode: string; autoAcknowledge: boolean; targets: Prisma.JsonValue; signature: string | null; branchId: string | null; isDefault: boolean }): QueueRow => ({
  ...q, aiMode: asAiMode(q.aiMode), targets: readTargets(q.targets),
});

/** The organisation's default queue — created ("General support") the first time it is needed. */
export async function defaultQueue(organisationId: string): Promise<QueueRow> {
  const found = await prisma.supportQueue.findFirst({ where: { organisationId, active: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: queueSelect });
  if (found) return toQueue(found);
  const created = await prisma.supportQueue.upsert({
    where: { organisationId_name: { organisationId, name: 'General support' } },
    create: { organisationId, name: 'General support', kind: 'general', isDefault: true, aiMode: 'SUGGEST' },
    update: { active: true },
    select: queueSelect,
  });
  return toQueue(created);
}

export async function queueById(organisationId: string, id: string | null | undefined): Promise<QueueRow> {
  if (id) {
    const q = await prisma.supportQueue.findFirst({ where: { id, organisationId }, select: queueSelect });
    if (q) return toQueue(q);
  }
  return defaultQueue(organisationId);
}

// ─────────────────────────────────────────────────────────── numbers & tokens

const lagosYear = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', year: 'numeric' }).format(d));

/** "latest + 1" for this year (the unique constraint and a retry handle two at once). */
export async function nextSupportNumber(): Promise<string> {
  const prefix = `SUP-${lagosYear()}-`;
  const latest = await prisma.supportTicket.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
  const seq = latest ? Number.parseInt(latest.number.slice(prefix.length), 10) : 0;
  return `${prefix}${String((Number.isFinite(seq) ? seq : 0) + 1).padStart(6, '0')}`;
}

export const newToken = () => randomBytes(24).toString('base64url');

/** Where the sender follows their request: a colleague's own help page in the portal, or the customer's page on the website. */
export function followUrl(t: { id: string; token: string | null; requesterUserId?: string | null }): string | null {
  if (t.requesterUserId) {
    const portal = portalBaseUrl();
    return portal ? `${portal}/support/help/${t.id}` : null;
  }
  return responseUrl(t.token);
}

/** The customer's own page for a request ("Solved / Talk to a person / Rate us") on the website. */
export function responseUrl(token: string | null | undefined): string | null {
  const site = websiteBaseUrl();
  return token && site ? `${site}/support/request/${token}` : null;
}

// ─────────────────────────────────────────────────────────── opening a ticket

export type NewTicket = {
  organisationId: string; channel: 'EMAIL' | 'STAFF' | 'CUSTOMER_PORTAL' | 'WEBSITE'; queue: QueueRow; mailboxId?: string | null; branchId?: string | null;
  customerId?: string | null; contactName: string; contactEmail?: string | null; contactPhone?: string | null; subject: string; summary: string;
  priority: Priority; triage?: Triage | null; entities?: unknown; verified?: boolean; authenticatedSender?: boolean; sourceMessageId?: string | null; openedAt?: Date;
  /** Enyo should read it on the next run (email tickets). */
  aiPending?: boolean; handoverReason?: string | null;
  /** v37: a colleague's own help request (private from the first moment), who is writing, and tags. */
  requesterUserId?: string | null; senderKind?: string | null; senderUserId?: string | null; tags?: string[];
};

/** Creates the ticket with its targets and owner (load-balanced in the queue). */
export async function openTicket(t: NewTicket, tx: Prisma.TransactionClient = prisma): Promise<{ id: string; number: string; token: string; assignedToId: string | null; dueFirstResponseAt: Date }> {
  const settings = await supportSettings(t.organisationId);
  const opened = t.openedAt ?? new Date();
  const due = dueDates(opened, t.priority, t.queue.targets, settings.hours, settings.holidays);
  const assignee = await nextAssignee(t.organisationId, t.queue.id);
  const token = newToken();
  const row = await retryOnNumberClash('number', async () => tx.supportTicket.create({
    data: {
      organisationId: t.organisationId, branchId: t.branchId ?? t.queue.branchId ?? null, number: await nextSupportNumber(), channel: t.channel,
      customerId: t.customerId ?? null, contactName: t.contactName.slice(0, 120) || 'Customer', contactEmail: t.contactEmail ?? null, contactPhone: t.contactPhone ?? null,
      subject: t.subject.slice(0, 200) || 'Your request', summary: t.summary.slice(0, 1200), queueId: t.queue.id, mailboxId: t.mailboxId ?? null,
      priority: t.priority, topic: t.triage?.topic ?? null, sentiment: t.triage?.sentiment ?? null, language: t.triage?.language ?? null,
      entities: (t.entities ?? undefined) as Prisma.InputJsonValue | undefined, verified: Boolean(t.verified), authenticatedSender: Boolean(t.authenticatedSender), token,
      aiPendingAt: t.aiPending ? new Date() : null, handoverReason: t.handoverReason ?? null,
      requesterUserId: t.requesterUserId ?? null, senderKind: t.senderKind ?? null, senderUserId: t.senderUserId ?? null, ...(t.tags?.length ? { tags: t.tags.slice(0, 10) } : {}),
      dueFirstResponseAt: due.first, dueResolutionAt: due.resolve, lastCustomerAt: opened, assignedToId: assignee, sourceMessageId: t.sourceMessageId ?? null,
      createdAt: opened,
    },
    select: { id: true, number: true, token: true, assignedToId: true, dueFirstResponseAt: true },
  }));
  if (assignee) await prisma.supportQueueMember.updateMany({ where: { queueId: t.queue.id, userId: assignee }, data: { lastAssignedAt: new Date() } }).catch(() => undefined);
  return { id: row.id, number: row.number, token: row.token!, assignedToId: row.assignedToId, dueFirstResponseAt: row.dueFirstResponseAt! };
}

/** The queue member to give the next ticket to (fewest open, not away, under capacity), or nobody. */
export async function nextAssignee(organisationId: string, queueId: string): Promise<string | null> {
  const members = await prisma.supportQueueMember.findMany({ where: { queueId, organisationId }, select: { userId: true, capacity: true, away: true, lastAssignedAt: true } });
  if (!members.length) return null;
  const active = await prisma.user.findMany({ where: { id: { in: members.map((m) => m.userId) }, organisationId, isActive: true }, select: { id: true } });
  const ok = new Set(active.map((u) => u.id));
  const open = await prisma.supportTicket.groupBy({ by: ['assignedToId'], where: { organisationId, assignedToId: { in: [...ok] }, status: { in: ['OPEN', 'ON_HOLD'] } }, _count: { _all: true } });
  const load = new Map(open.map((o) => [o.assignedToId, o._count._all]));
  return pickAssignee(members.filter((m) => ok.has(m.userId)).map((m) => ({ ...m, open: load.get(m.userId) ?? 0 })));
}

// ─────────────────────────────────────────────────────────── Enyo

/** Enyo's reading of an email (fast model). Null when Enyo is off or the model did not answer usefully. */
export async function triageEmail(organisationId: string, o: { queueName: string; subject: string; body: string; timeoutMs?: number; sender?: SenderContext | null }): Promise<Triage | null> {
  const ready = await enyoReady(organisationId, 'customerAssistant');
  if (!ready.ready) return null;
  try {
    const res = await complete({ ...ready.config, timeoutMs: Math.min(ready.config.timeoutMs, o.timeoutMs ?? 15_000) }, { model: ready.config.fastModel, messages: triageMessages({ ...o, sender: o.sender ? SENDER_KIND_LABEL[o.sender.kind] : undefined }, asData), temperature: 0, maxTokens: 300 });
    return parseTriage(res.content);
  } catch (err) {
    logFailure('Support triage failed', err);
    return null;
  }
}

/** What Enyo may answer from: the organisation's contact facts, hours, and answers people approved. */
export async function supportKnowledge(organisationId: string, question: string, colleague = false): Promise<{ knowledge: Knowledge; bestScore: number }> {
  const [org, branches, settings, learned] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true, hotlines: true, email: true, hqAddress: true, website: true } }),
    prisma.branch.findMany({ where: { isActive: true, businessUnit: { organisationId, isActive: true } }, orderBy: { name: 'asc' }, take: 20, select: { name: true, address: true, hotlines: true, email: true } }),
    supportSettings(organisationId),
    // A colleague's help request learns from colleagues' answers too; customers never see those.
    findLearned(organisationId, colleague ? ['STAFF', 'SUPPORT'] : ['SUPPORT', 'CUSTOMER', 'PUBLIC'], question, 5).catch(() => []),
  ]);
  return {
    bestScore: learned[0]?.score ?? 0,
    knowledge: {
      organisation: org?.name ?? PLATFORM.name,
      contact: { phones: org?.hotlines ?? [], email: org?.email ?? null, address: org?.hqAddress ?? null, website: org?.website ?? null },
      hours: hoursSentence(settings.hours),
      branches: branches.map((b) => ({ name: b.name, address: b.address, phones: b.hotlines, email: b.email })),
      answers: learned.filter((l) => l.score >= EXAMPLE_MIN).map((l) => ({ id: l.id, question: l.question, answer: l.answer })),
    },
  };
}

/** Facts-type topics Enyo can answer from the organisation's details even without an approved answer. */
const FACT_TOPICS = new Set(['opening_hours', 'location_contact']);

export type AiReplyResult = AiAnswer & { hasSources: boolean; model: string; unknownContacts: string[]; recordsReady: boolean; personOnly: string | null };

/** Something only a colleague can do, from the sign-in check (a reason code for aiDecision). */
export function personOnlyFrom(ctx: SenderContext | null | undefined, topic: string | null): string | null {
  // Unproven senders are treated alike whatever the account's state (nothing confirms that an account exists).
  if (!ctx?.proven || !ctx.login || !ctx.login.needsPerson) return null;
  // Only when the question is about getting in: a switched-off customer asking opening hours is answered as usual.
  if (topic !== 'account_access') return null;
  return ctx.login.code === 'access_off' ? 'access_off' : ctx.login.code === 'deactivated' ? 'deactivated' : 'no_account';
}

/**
 * Enyo's reply (to send by itself, or as a draft for a colleague), from the
 * organisation's details, approved answers and — when the sender is proven —
 * their own records and the links to them (context-core senderFacts).
 */
export async function aiReply(organisationId: string, o: { customerName: string; subject: string; body: string; topic: string | null; mode: 'answer' | 'draft'; timeoutMs?: number; context?: SenderContext | null }): Promise<AiReplyResult | null> {
  const ready = await enyoReady(organisationId, 'customerAssistant');
  if (!ready.ready) return null;
  const colleague = Boolean(o.context?.staff && (o.context.provenHow === 'own_request' || o.context.kind === 'staff'));
  const { knowledge, bestScore } = await supportKnowledge(organisationId, `${o.subject}\n${o.body}`.slice(0, 2000), o.context?.provenHow === 'own_request');
  const sender = o.context ? senderFacts(o.context) : null;
  // Records Enyo was given for a question it may answer from them (still never money, complaints or safety).
  const recordsReady = recordsReadyFor(o.context, o.topic);
  const personOnly = personOnlyFrom(o.context, o.topic);
  const hasSources = knowledge.answers.length > 0 || FACT_TOPICS.has(o.topic ?? '') || recordsReady;
  try {
    const res = await complete({ ...ready.config, timeoutMs: Math.min(ready.config.timeoutMs, o.timeoutMs ?? 25_000) }, {
      model: ready.config.model,
      messages: answerMessages({ assistant: ready.settings.displayName || PLATFORM.assistant, customerName: o.customerName, subject: o.subject, body: o.body, knowledge, mode: o.mode, ...(sender ? { sender: { ...sender, colleague } } : {}) }, asData),
      temperature: 0.2,
      maxTokens: 1100,
    });
    const a = parseAnswer(res.content, knowledge.answers.map((x) => x.id));
    if (!a) return null;
    // Sure of itself only as far as the sources go: an approved answer that barely matches caps the confidence;
    // an answer from the sender's own records is capped a little below certain.
    const confidence = recordsReady ? Math.min(a.confidence, 0.9)
      : knowledge.answers.length ? Math.min(a.confidence, 0.5 + bestScore / 2)
        : FACT_TOPICS.has(o.topic ?? '') ? a.confidence : Math.min(a.confidence, 0.5);
    // Links, phones and emails must come from our own details, approved answers or the sender's links.
    const strangers = [
      ...unknownContacts(a.reply, `${JSON.stringify(knowledge)}\n${(sender?.links ?? []).map((l) => l.url).join('\n')}`),
      ...unknownSpecifics(a.reply, [...(sender?.links ?? []).map((l) => l.url), ...(o.context?.customerLinks ?? []).slice(0, 3).map((l) => l.url), ...(knowledge.contact.website ? [knowledge.contact.website] : []), ...knowledge.answers.flatMap((x) => [...x.answer.matchAll(/https?:\/\/[^\s<>()"']+/g)].map((m) => m[0]))], `${sender?.text ?? ''}\n${o.subject}\n${o.body}`),
    ];
    return { ...a, confidence: a.needsPerson || strangers.length || personOnly ? 0 : confidence, hasSources, model: res.model, unknownContacts: strangers, recordsReady, personOnly };
  } catch (err) {
    logFailure('Support AI reply failed', err);
    return null;
  }
}

/** A short hand-over note from the whole thread. */
export async function aiSummary(organisationId: string, subject: string, thread: string): Promise<string | null> {
  const ready = await enyoReady(organisationId, 'customerAssistant');
  if (!ready.ready) return null;
  try {
    const res = await complete({ ...ready.config, timeoutMs: Math.min(ready.config.timeoutMs, 15_000) }, { model: ready.config.fastModel, messages: summaryMessages({ subject, thread }, asData), temperature: 0, maxTokens: 300 });
    const text = res.content.replace(/<\/?untrusted[^>]*>/gi, '').trim();
    return text ? text.slice(0, 1200) : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────── sending

const MAILBOX_SECRET_SELECT = {
  id: true, organisationId: true, address: true, displayName: true, imapHost: true, imapPort: true, imapSecure: true, smtpHost: true, smtpPort: true, smtpSecure: true, username: true, secret: true,
} as const;

/** The additional data binding a support mailbox's encrypted password to its organisation and address. */
export const supportSecretOwner = (organisationId: string) => `support:${organisationId}`;

export function supportConnection(m: { organisationId: string; id: string; address: string; displayName: string | null; imapHost: string; imapPort: number; imapSecure: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean; username: string; secret: string }) {
  const stored: StoredAccount = { ...m, userId: supportSecretOwner(m.organisationId) };
  return connectionSettings(stored);
}

export type Outgoing = { organisationId: string; ticketId: string; mailboxId: string | null; to: string; subject: string; html: string; inReplyTo?: string | null; references?: string[]; automatic: boolean; timeoutMs?: number };

/**
 * Sends from the ticket's support mailbox (so replies come back to it), or —
 * when there is none — from the system address with the queue's mailbox as
 * Reply-To. Returns the Message-ID used (kept on the reply, for threading).
 */
export async function sendFromSupport(o: Outgoing): Promise<{ messageId: string; via: 'mailbox' | 'system' }> {
  const box = o.mailboxId ? await prisma.supportMailbox.findFirst({ where: { id: o.mailboxId, organisationId: o.organisationId, status: { not: 'PAUSED' } }, select: MAILBOX_SECRET_SELECT }) : null;
  const domain = (box?.address ?? process.env.SMTP_FROM ?? 'support.local').replace(/^.*@/, '').replace(/[>\s].*$/, '');
  const messageId = newMessageId(o.ticketId, domain, randomBytes(6).toString('hex'));
  const headers: Record<string, string> = {
    ...(o.automatic ? autoReplyHeaders(o.inReplyTo, o.references) : { ...(o.inReplyTo ? { 'In-Reply-To': o.inReplyTo } : {}), ...(o.references?.length ? { References: o.references.slice(-10).join(' ') } : {}) }),
  };
  if (box) {
    const s = supportConnection(box);
    const transport = await smtpTransport(s.smtp);
    try {
      await withTimeout(transport.sendMail({
        from: box.displayName ? { name: box.displayName, address: box.address } : box.address,
        to: o.to,
        subject: o.subject,
        html: o.html,
        text: htmlToText(o.html),
        messageId,
        headers,
      }), o.timeoutMs ?? 25_000, 'smtp');
    } finally {
      transport.close();
    }
    return { messageId, via: 'mailbox' };
  }
  await sendEmail(o.to, o.subject, o.html, undefined, { headers: { ...headers, 'Message-ID': messageId } });
  return { messageId, via: 'system' };
}

/** Everything a support email needs about the organisation and the ticket's branch. */
export async function letterheadFor(organisationId: string, branchId: string | null): Promise<{ companyName: string; logoUrl: string; branchContact?: { address: string | null; phones: string[]; email: string | null } }> {
  const [org, branch] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true, hotlines: true, email: true, hqAddress: true } }),
    branchId ? prisma.branch.findUnique({ where: { id: branchId }, select: { address: true, hotlines: true, email: true } }) : null,
  ]);
  const site = websiteBaseUrl() || portalBaseUrl();
  return {
    companyName: org?.name ?? PLATFORM.name,
    logoUrl: `${site}/images/logo/email-logo.png`,
    branchContact: branch ? { address: branch.address, phones: branch.hotlines, email: branch.email } : org ? { address: org.hqAddress, phones: org.hotlines, email: org.email } : undefined,
  };
}

/** The tagged subject for a ticket. */
export const subjectFor = taggedSubject;

/** A business event in the audit trail (no message text) — it also drives the staff bell. */
export async function supportEvent(o: { organisationId: string; ticketId: string; action: string; userId?: string | null; metadata?: Record<string, unknown> }): Promise<void> {
  await prisma.auditLog.create({ data: { organisationId: o.organisationId, userId: o.userId ?? null, action: o.action, entityType: 'SupportTicket', entityId: o.ticketId, metadata: (o.metadata ?? {}) as Prisma.InputJsonValue } }).catch(() => undefined);
}
