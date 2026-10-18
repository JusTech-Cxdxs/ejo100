"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerBroadcastEmail = renderCustomerBroadcastEmail;
const layout_1 = require("./layout");
/** A message from the organisation to its customers (a customer broadcast). No staff names. */
function renderCustomerBroadcastEmail(o) {
    const paragraphs = o.message.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${paragraphs.map((p) => (0, layout_1.para)(p))}
    ${(0, layout_1.para)('You can also read this message in your customer portal.', 'small')}`;
    return {
        subject: `${o.title} | ${o.companyName}`,
        html: (0, layout_1.renderEmailLayout)({
            previewText: paragraphs[0] ?? o.title,
            companyName: o.companyName,
            logoUrl: o.logoUrl,
            orgContext: [o.categoryLabel],
            status: { label: o.categoryLabel || 'Announcement', tone: 'success' },
            heading: o.title,
            bodyHtml,
            ctaLabel: 'Open my customer portal',
            ctaUrl: o.portalUrl,
            audience: 'customer',
            reason: o.preferencesUrl
                ? `You are receiving this because you chose to get announcements from ${o.companyName} by email. You can turn this off on your customer portal profile page: ${o.preferencesUrl.replace(/^https?:\/\//, '')}`
                : `You are receiving this because you chose to get announcements from ${o.companyName} by email. You can turn this off in your customer portal profile.`,
        }),
    };
}
