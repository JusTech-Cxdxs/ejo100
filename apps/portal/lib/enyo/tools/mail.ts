/**
 * Enyo tools — the person's OWN work mailbox, and only when they have
 * allowed Enyo to read it. Never another person's mail (the readers look the
 * mailbox up by the signed-in person's id), never during an assisted
 * session, and nothing is ever sent: a reply is a draft on /mail/compose that
 * the person reads and sends. Email text in results is wrapped as untrusted
 * data. Server-only.
 */
import { asData } from '@ejo/enyo';
import { draftResult, type StaffTool, type StaffCtx } from '../types';
import { getMessageForCompose, getMyMailDigest, listMyMail } from '@/lib/actions/mail';
import { composeHref, parseAddressList, replySubject } from '@/lib/mail/rules';
import { formatLagos, plural } from '@/lib/reminders-rules';

type Gate = { ok: true } | { ok: false; refused?: boolean; message: string };

/** Mailbox connected, consent given, Enyo for email on, not an assisted session. */
async function gate(ctx: StaffCtx): Promise<Gate & { unread?: number }> {
  if (ctx.assisted) return { ok: false, refused: true, message: 'A person\'s email is never shown during an assisted session. Say so kindly.' };
  const d = await getMyMailDigest();
  if (!d.connected) return { ok: false, message: 'This person has not connected a work mailbox. They can connect it at /mail/connect.' };
  if (!d.aiAvailable) return { ok: false, refused: true, message: 'Enyo for email is switched off for this organisation, so their email cannot be read. They can still open it at /mail.' };
  if (!d.consent) return { ok: false, refused: true, message: `This person has not allowed Enyo to read their email. They have ${plural(d.unread, 'unread message')} at /mail. If they want your help with email, they can allow it in Mail settings (/mail/settings#enyo).` };
  return { ok: true, unread: d.unread };
}

/** "/mail?m=abc", "abc" → the message id. */
function messageIdFrom(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /(?:[?&]m=)?([A-Za-z0-9_-]{8,64})\s*$/.exec(v.trim());
  return m ? m[1]! : null;
}

export const mailTools: StaffTool[] = [
  {
    name: 'mail_overview',
    kind: 'read',
    status: 'Looking at your mail…',
    description: "The person's own work email at a glance: unread count and what needs them today, each with Enyo's one-line summary and a link. Use for \"anything important in my email?\", \"what's in my inbox\".",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_args, ctx) => {
      const g = await gate(ctx);
      if (!g.ok) return g;
      const d = await getMyMailDigest();
      const lines = d.needsYou.map((n, i) => `${i + 1}. From ${n.from}, ${formatLagos(n.receivedAt)}: "${n.subject}"${n.summary ? ` — ${n.summary}` : ''}`);
      return {
        ok: true,
        data: {
          unread: d.unread,
          summary: `${plural(d.unread, 'unread message')}; ${plural(d.needsYou.length, 'message')} marked as needing them today.`,
          needsYouToday: lines.length ? asData('their email', lines.join('\n')) : 'Nothing marked as needing them today.',
          links: d.needsYou.map((n, i) => ({ n: i + 1, link: n.href })),
          lastChecked: d.lastSyncAt ? `${formatLagos(d.lastSyncAt)} (Lagos)` : 'not yet',
          page: '/mail',
        },
        sources: [{ label: 'Mail', href: '/mail' }],
      };
    },
  },
  {
    name: 'mail_search',
    kind: 'read',
    status: 'Searching your mail…',
    description: "Search the person's own work email (last 90 days) by words, a sender, a reference number or a plate. Returns up to 8 messages with Enyo's summary and links to open them.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to look for: a name, an email address, JC-2026-000012, a plate, a subject.', minLength: 2, maxLength: 100 },
        unread_only: { type: 'boolean', description: 'Only unread messages.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const g = await gate(ctx);
      if (!g.ok) return g;
      const { items } = await listMyMail({ q: String(args.query), view: args.unread_only === true ? 'unread' : 'inbox' });
      const top = items.slice(0, 8);
      if (!top.length) return { ok: true, data: { found: 0, message: `No messages match "${String(args.query)}".` } };
      const lines = top.map((m, i) => `${i + 1}. From ${m.fromName ?? m.fromAddress} <${m.fromAddress}>, ${formatLagos(m.receivedAt)}${m.seen ? '' : ' (unread)'}: "${m.subject}" — ${m.aiSummary ?? m.snippet}`);
      return {
        ok: true,
        data: {
          found: items.length,
          messages: asData('their email', lines.join('\n')),
          links: top.map((m, i) => ({ n: i + 1, link: `/mail?m=${m.id}` })),
        },
        sources: [{ label: 'Mail', href: '/mail' }],
      };
    },
  },
  {
    name: 'draft_mail_reply',
    kind: 'draft',
    status: 'Preparing the reply…',
    description: [
      'Prepare an email for the person to check and send themselves — a reply to one of their messages (pass the message link from mail_search or mail_overview), or a new message (pass to and subject).',
      'It opens the compose page filled in; it NEVER sends. Write the body in plain text, in the person\'s voice, polite and short, without inventing facts, prices or dates.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The link of the message being answered, e.g. /mail?m=…', maxLength: 200 },
        reply_all: { type: 'boolean', description: 'Reply to everyone on the message.' },
        to: { type: 'string', description: 'New message only: email address(es), comma-separated.', maxLength: 1000 },
        subject: { type: 'string', description: 'New message only: the subject.', maxLength: 300 },
        body: { type: 'string', description: 'The text of the email.', minLength: 1, maxLength: 6000 },
      },
      required: ['body'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const g = await gate(ctx);
      if (!g.ok) return g;
      const body = String(args.body ?? '').trim();
      const id = messageIdFrom(args.message);
      if (id) {
        // Only one of the person's own messages (the reader refuses any other).
        const original = await getMessageForCompose(id).catch(() => null);
        if (!original) return { ok: false, message: 'That message was not found in this person\'s mailbox. Search for it again with mail_search.' };
        const href = `${composeHref({ inReplyTo: original.id, replyAll: args.reply_all === true, body })}&source=enyo`;
        return draftResult({
          kind: 'mail', title: args.reply_all === true ? 'Reply all ready to check' : 'Reply ready to check',
          lines: [`To: ${original.fromName ?? original.fromAddress}`, `Subject: ${replySubject(original.subject, 'reply')}`, body.slice(0, 300)],
          href, confirmLabel: 'Review and send',
        });
      }
      const to = parseAddressList(args.to);
      if (!to.valid.length) return { ok: false, message: 'Say who the email is to (an email address), or which message it answers.' };
      const subject = String(args.subject ?? '').trim();
      if (!subject) return { ok: false, message: 'Ask what the subject should be.' };
      const href = `${composeHref({ to: to.valid.join(', '), subject, body })}&source=enyo`;
      return draftResult({ kind: 'mail', title: 'Email ready to check', lines: [`To: ${to.valid.join(', ')}`, `Subject: ${subject}`, body.slice(0, 300)], href, confirmLabel: 'Review and send' });
    },
  },
];
