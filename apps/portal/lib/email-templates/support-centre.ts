import { renderEmailLayout, html, greeting, para, callout, details, raw, EMAIL_FONT, type SafeHtml, type BranchContact } from './layout';
import { REPLY_ABOVE } from '../support/core';

/**
 * Emails from the Support centre (support@, warranty@ …), in the
 * organisation's letterhead. Each carries the ticket reference in the subject
 * ([#SUP-…]) so replies thread, a "reply above this line" marker, and the
 * customer's own page for "Solved / Talk to a person / Rate us" (the link is
 * unguessable and asks before it changes anything). Staff names are shown
 * only as the signature the colleague chose; Enyo's replies are labelled.
 */

type Common = {
  companyName: string;
  logoUrl: string;
  queueName: string;
  number: string;
  subject: string;
  customerName: string;
  /** The customer's page for this request (solved / talk to a person / rate). */
  responseUrl: string | null;
  branchContact?: BranchContact;
};

const textBlocks = (text: string): SafeHtml => html`${text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean).slice(0, 40).map((b) => para(html`${b.split('\n').map((l, i) => html`${i ? raw('<br />') : ''}${l}`)}`))}`;

const marker = () => html`<p class="ejo-muted" style="margin: 0 0 14px 0; font-family: ${raw(EMAIL_FONT)}; font-size: 11px; color: #94a3b8;">${REPLY_ABOVE}</p>`;

function buttons(rows: { label: string; url: string; tone: 'primary' | 'plain' }[]): SafeHtml {
  return html`
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 18px 0 6px 0;"><tr>
      ${rows.map((b) => html`<td style="padding: 0 8px 8px 0;"><a href="${b.url}" style="display: inline-block; padding: 10px 16px; border-radius: 10px; font-family: ${raw(EMAIL_FONT)}; font-size: 14px; font-weight: 600; text-decoration: none; ${raw(b.tone === 'primary' ? 'background: #15803d; color: #ffffff;' : 'background: #f1f5f9; color: #0f172a; border: 1px solid #e2e8f0;')}">${b.label}</a></td>`)}
    </tr></table>`;
}

/** "We've got your message" — the reference, the team, and when to expect an answer. */
export function renderSupportAcknowledgement(o: Common & { promise: string; open: boolean; teamMessage?: string | null }): { subject: string; html: string } {
  const bodyHtml = html`
    ${marker()}
    ${greeting(o.customerName)}
    ${para(`Thank you for writing to ${o.companyName}. Your message has reached our ${o.queueName} team and has the reference ${o.number}.`)}
    ${o.teamMessage ? textBlocks(o.teamMessage) : ''}
    ${callout(`A colleague will answer ${o.promise}.${o.open ? '' : ' We are closed right now; we start with the oldest messages when we open.'}`, 'info', 'When to expect an answer')}
    ${details([['Reference', o.number], ['About', o.subject], ['Team', o.queueName]])}
    ${para('To add anything (photos, your plate number, a better time to call), simply reply to this email. Please keep the reference in the subject.', 'small')}
    ${para('If your vehicle is unsafe to drive or you are stranded, please call us now instead of waiting for an email.', 'small')}`;
  return {
    subject: `[#${o.number}] We've received your message`,
    html: renderEmailLayout({
      previewText: `Reference ${o.number}. A colleague will answer ${o.promise}.`,
      companyName: o.companyName,
      logoUrl: o.logoUrl,
      orgContext: [o.queueName],
      status: { label: 'Received', tone: 'info' },
      heading: 'We have your message',
      bodyHtml,
      ...(o.responseUrl ? { ctaLabel: 'Follow your request', ctaUrl: o.responseUrl } : {}),
      audience: 'customer',
      reason: `You are receiving this because you wrote to ${o.companyName}.`,
      ...(o.branchContact ? { branchContact: o.branchContact } : {}),
    }),
  };
}

/** A reply on the ticket: by a colleague, or by Enyo (labelled, with Solved / Talk to a person). */
export function renderSupportReply(o: Common & { body: string; by: 'agent' | 'ai'; assistantName: string; signature: string | null; statusLabel: string; fromRecords?: boolean; colleague?: boolean }): { subject: string; html: string } {
  const ai = o.by === 'ai';
  const bodyHtml = html`
    ${marker()}
    ${greeting(o.customerName)}
    ${textBlocks(o.body)}
    ${o.signature ? html`<p style="margin: 18px 0 0 0; font-family: ${raw(EMAIL_FONT)}; font-size: 13px; line-height: 1.55; color: #334155; white-space: pre-line;">${o.signature}</p>` : ''}
    ${ai ? callout(`This answer was written by ${o.assistantName}, our AI assistant, from ${o.fromRecords ? (o.colleague ? 'your account and our how-to guides' : 'your records with us and our published information') : 'our published information'}. A ${o.colleague ? 'person on the support team' : 'colleague'} is one click away.`, 'neutral', 'About this reply') : ''}
    ${ai && o.responseUrl ? buttons([{ label: 'Yes, this solved it', url: `${o.responseUrl}?a=solved`, tone: 'primary' }, { label: 'I still need a person', url: `${o.responseUrl}?a=person`, tone: 'plain' }]) : ''}
    ${details([['Reference', o.number], ['Status', o.statusLabel]])}
    ${para(o.colleague ? 'To answer, open your request in the portal (Get help) and write there.' : 'To answer, reply to this email and keep the reference in the subject.', 'small')}`;
  return {
    subject: `[#${o.number}] ${o.subject.replace(/^\s*(re|fw|fwd)\s*:\s*/i, '')}`.slice(0, 300),
    html: renderEmailLayout({
      previewText: o.body.replace(/\s+/g, ' ').slice(0, 140),
      companyName: o.companyName,
      logoUrl: o.logoUrl,
      orgContext: [o.queueName],
      ...(ai ? { status: { label: 'AI assistant', tone: 'info' as const } } : {}),
      heading: ai ? 'An answer to your question' : 'A reply from our team',
      bodyHtml,
      ...(!ai && o.responseUrl ? { ctaLabel: o.colleague ? 'Open my request' : 'Follow your request', ctaUrl: o.responseUrl } : {}),
      audience: o.colleague ? 'staff' : 'customer',
      reason: `You are receiving this because you asked ${o.companyName} for help (${o.number}).`,
      ...(o.branchContact ? { branchContact: o.branchContact } : {}),
    }),
  };
}

/** "Is there anything else?" — sent when a request waits on the customer. */
export function renderSupportNudge(o: Common & { closesInDays: number; last: boolean }): { subject: string; html: string } {
  const bodyHtml = html`
    ${marker()}
    ${greeting(o.customerName)}
    ${para(`We are checking in on your request ${o.number} (“${o.subject}”). We are waiting for your reply.`)}
    ${para(o.last ? `If we do not hear from you, we will mark it as resolved in ${o.closesInDays} day${o.closesInDays === 1 ? '' : 's'}. You can always reply to open it again.` : 'Reply to this email whenever you are ready, or let us know it is sorted.')}
    ${o.responseUrl ? buttons([{ label: 'It is sorted', url: `${o.responseUrl}?a=solved`, tone: 'primary' }, { label: 'I still need help', url: `${o.responseUrl}?a=person`, tone: 'plain' }]) : ''}`;
  return {
    subject: `[#${o.number}] Do you still need help?`,
    html: renderEmailLayout({
      previewText: `We are waiting for your reply on ${o.number}.`,
      companyName: o.companyName,
      logoUrl: o.logoUrl,
      orgContext: [o.queueName],
      status: { label: 'Waiting for you', tone: 'warning' },
      heading: 'Do you still need help?',
      bodyHtml,
      audience: 'customer',
      reason: `You are receiving this because you asked ${o.companyName} for help (${o.number}).`,
      ...(o.branchContact ? { branchContact: o.branchContact } : {}),
    }),
  };
}

/** "How did we do?" — one question, five answers, after a request is resolved. */
export function renderSupportSatisfaction(o: Common): { subject: string; html: string } {
  const faces = [['1', 'Very poor'], ['2', 'Poor'], ['3', 'Okay'], ['4', 'Good'], ['5', 'Excellent']] as const;
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`Your request ${o.number} (“${o.subject}”) is resolved. How did we do?`)}
    ${o.responseUrl ? html`
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 14px 0;"><tr>
        ${faces.map(([n, label]) => html`<td style="padding: 0 6px 6px 0;"><a href="${o.responseUrl}?rate=${n}" style="display: inline-block; min-width: 76px; text-align: center; padding: 10px 8px; border-radius: 10px; border: 1px solid #e2e8f0; background: #f8fafc; font-family: ${raw(EMAIL_FONT)}; font-size: 13px; color: #0f172a; text-decoration: none;"><strong style="display: block; font-size: 18px;">${n}</strong>${label}</a></td>`)}
      </tr></table>` : ''}
    ${para('One click is enough; you can add a comment on the next page if you like. If something is still not right, just reply to this email and the request opens again.', 'small')}`;
  return {
    subject: `[#${o.number}] How did we do?`,
    html: renderEmailLayout({
      previewText: `Your request ${o.number} is resolved. How did we do?`,
      companyName: o.companyName,
      logoUrl: o.logoUrl,
      orgContext: [o.queueName],
      status: { label: 'Resolved', tone: 'success' },
      heading: 'How did we do?',
      bodyHtml,
      audience: 'customer',
      reason: `You are receiving this because ${o.companyName} helped you with ${o.number}.`,
      ...(o.branchContact ? { branchContact: o.branchContact } : {}),
    }),
  };
}
