"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerSupportReplyEmail = renderCustomerSupportReplyEmail;
const layout_1 = require("./layout");
/** Customer care answered a support request (hand-over from Enyo). No staff names. */
function renderCustomerSupportReplyEmail(o) {
    const paragraphs = o.reply.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 30);
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`Our customer care team has replied to your request ${o.ticketNumber}.`)}
    ${(0, layout_1.callout)(paragraphs.map((p) => (0, layout_1.html) `<p style="margin: 0 0 8px 0;">${p}</p>`), 'info', 'Their reply')}
    ${(0, layout_1.details)([['Reference', o.ticketNumber], ['About', o.subject], ['Status', o.statusLabel]])}
    ${o.portalUrl
        ? (0, layout_1.para)('You can answer from Help & support in your customer portal; your reply goes straight to the team.', 'small')
        : (0, layout_1.para)(`To answer, reply to this email or call us and quote ${o.ticketNumber}.`, 'small')}`;
    return {
        subject: `Reply to your request ${o.ticketNumber}`,
        html: (0, layout_1.renderEmailLayout)({
            previewText: paragraphs[0] ?? `Our team replied to ${o.ticketNumber}.`,
            companyName: o.companyName,
            logoUrl: o.logoUrl,
            orgContext: [o.branchName, 'Customer care'],
            status: { label: o.statusLabel, tone: o.statusLabel === 'Resolved' ? 'success' : 'info' },
            heading: 'Our team replied',
            bodyHtml,
            ...(o.portalUrl ? { ctaLabel: 'Open Help & support', ctaUrl: o.portalUrl } : {}),
            audience: 'customer',
            reason: `You are receiving this because you asked ${o.companyName} for help.`,
        }),
    };
}
