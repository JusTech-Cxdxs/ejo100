"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderSupportAcknowledgement = renderSupportAcknowledgement;
exports.renderSupportReply = renderSupportReply;
exports.renderSupportNudge = renderSupportNudge;
exports.renderSupportSatisfaction = renderSupportSatisfaction;
const layout_1 = require("./layout");
const core_1 = require("../support/core");
const textBlocks = (text) => (0, layout_1.html) `${text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean).slice(0, 40).map((b) => (0, layout_1.para)((0, layout_1.html) `${b.split('\n').map((l, i) => (0, layout_1.html) `${i ? (0, layout_1.raw)('<br />') : ''}${l}`)}`))}`;
const marker = () => (0, layout_1.html) `<p class="ejo-muted" style="margin: 0 0 14px 0; font-family: ${(0, layout_1.raw)(layout_1.EMAIL_FONT)}; font-size: 11px; color: #94a3b8;">${core_1.REPLY_ABOVE}</p>`;
function buttons(rows) {
    return (0, layout_1.html) `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 18px 0 6px 0;"><tr>
      ${rows.map((b) => (0, layout_1.html) `<td style="padding: 0 8px 8px 0;"><a href="${b.url}" style="display: inline-block; padding: 10px 16px; border-radius: 10px; font-family: ${(0, layout_1.raw)(layout_1.EMAIL_FONT)}; font-size: 14px; font-weight: 600; text-decoration: none; ${(0, layout_1.raw)(b.tone === 'primary' ? 'background: #b40000; color: #ffffff;' : 'background: #f1f5f9; color: #0f172a; border: 1px solid #e2e8f0;')}">${b.label}</a></td>`)}
    </tr></table>`;
}
/** "We've got your message" — the reference, the team, and when to expect an answer. */
function renderSupportAcknowledgement(o) {
    const bodyHtml = (0, layout_1.html) `
    ${marker()}
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`Thank you for writing to ${o.companyName}. Your message has reached our ${o.queueName} team and has the reference ${o.number}.`)}
    ${o.teamMessage ? textBlocks(o.teamMessage) : ''}
    ${(0, layout_1.callout)(`A colleague will answer ${o.promise}.${o.open ? '' : ' We are closed right now; we start with the oldest messages when we open.'}`, 'info', 'When to expect an answer')}
    ${(0, layout_1.details)([['Reference', o.number], ['About', o.subject], ['Team', o.queueName]])}
    ${(0, layout_1.para)('To add anything (photos, your plate number, a better time to call), simply reply to this email. Please keep the reference in the subject.', 'small')}
    ${(0, layout_1.para)('If your vehicle is unsafe to drive or you are stranded, please call us now instead of waiting for an email.', 'small')}`;
    return {
        subject: `[#${o.number}] We've received your message`,
        html: (0, layout_1.renderEmailLayout)({
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
function renderSupportReply(o) {
    const ai = o.by === 'ai';
    const bodyHtml = (0, layout_1.html) `
    ${marker()}
    ${(0, layout_1.greeting)(o.customerName)}
    ${textBlocks(o.body)}
    ${o.signature ? (0, layout_1.html) `<p style="margin: 18px 0 0 0; font-family: ${(0, layout_1.raw)(layout_1.EMAIL_FONT)}; font-size: 13px; line-height: 1.55; color: #334155; white-space: pre-line;">${o.signature}</p>` : ''}
    ${ai ? (0, layout_1.callout)(`This answer was written by ${o.assistantName}, our AI assistant, from ${o.fromRecords ? (o.colleague ? 'your account and our how-to guides' : 'your records with us and our published information') : 'our published information'}. A ${o.colleague ? 'person on the support team' : 'colleague'} is one click away.`, 'neutral', 'About this reply') : ''}
    ${ai && o.responseUrl ? buttons([{ label: 'Yes, this solved it', url: `${o.responseUrl}?a=solved`, tone: 'primary' }, { label: 'I still need a person', url: `${o.responseUrl}?a=person`, tone: 'plain' }]) : ''}
    ${(0, layout_1.details)([['Reference', o.number], ['Status', o.statusLabel]])}
    ${(0, layout_1.para)(o.colleague ? 'To answer, open your request in the portal (Get help) and write there.' : 'To answer, reply to this email and keep the reference in the subject.', 'small')}`;
    return {
        subject: `[#${o.number}] ${o.subject.replace(/^\s*(re|fw|fwd)\s*:\s*/i, '')}`.slice(0, 300),
        html: (0, layout_1.renderEmailLayout)({
            previewText: o.body.replace(/\s+/g, ' ').slice(0, 140),
            companyName: o.companyName,
            logoUrl: o.logoUrl,
            orgContext: [o.queueName],
            ...(ai ? { status: { label: 'AI assistant', tone: 'info' } } : {}),
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
function renderSupportNudge(o) {
    const bodyHtml = (0, layout_1.html) `
    ${marker()}
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`We are checking in on your request ${o.number} (“${o.subject}”). We are waiting for your reply.`)}
    ${(0, layout_1.para)(o.last ? `If we do not hear from you, we will mark it as resolved in ${o.closesInDays} day${o.closesInDays === 1 ? '' : 's'}. You can always reply to open it again.` : 'Reply to this email whenever you are ready, or let us know it is sorted.')}
    ${o.responseUrl ? buttons([{ label: 'It is sorted', url: `${o.responseUrl}?a=solved`, tone: 'primary' }, { label: 'I still need help', url: `${o.responseUrl}?a=person`, tone: 'plain' }]) : ''}`;
    return {
        subject: `[#${o.number}] Do you still need help?`,
        html: (0, layout_1.renderEmailLayout)({
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
function renderSupportSatisfaction(o) {
    const faces = [['1', 'Very poor'], ['2', 'Poor'], ['3', 'Okay'], ['4', 'Good'], ['5', 'Excellent']];
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`Your request ${o.number} (“${o.subject}”) is resolved. How did we do?`)}
    ${o.responseUrl ? (0, layout_1.html) `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 14px 0;"><tr>
        ${faces.map(([n, label]) => (0, layout_1.html) `<td style="padding: 0 6px 6px 0;"><a href="${o.responseUrl}?rate=${n}" style="display: inline-block; min-width: 76px; text-align: center; padding: 10px 8px; border-radius: 10px; border: 1px solid #e2e8f0; background: #f8fafc; font-family: ${(0, layout_1.raw)(layout_1.EMAIL_FONT)}; font-size: 13px; color: #0f172a; text-decoration: none;"><strong style="display: block; font-size: 18px;">${n}</strong>${label}</a></td>`)}
      </tr></table>` : ''}
    ${(0, layout_1.para)('One click is enough; you can add a comment on the next page if you like. If something is still not right, just reply to this email and the request opens again.', 'small')}`;
    return {
        subject: `[#${o.number}] How did we do?`,
        html: (0, layout_1.renderEmailLayout)({
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
