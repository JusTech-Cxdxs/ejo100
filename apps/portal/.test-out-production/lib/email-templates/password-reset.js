"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPasswordResetEmail = renderPasswordResetEmail;
const layout_1 = require("./layout");
/** Staff "forgot password": a one-time link to choose a new password (valid for 1 hour). */
function renderPasswordResetEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.fullName)}
    ${(0, layout_1.para)((0, layout_1.html) `We received a request to reset the password for your EJO 100 account${o.email ? (0, layout_1.html) ` (${(0, layout_1.strong)(o.email)})` : ''}. Use the button below to choose a new one.`)}
    ${(0, layout_1.list)([
        (0, layout_1.html) `The link works once and expires in ${(0, layout_1.strong)('1 hour')}.`,
        'Nobody from IT or administration will ever ask you for your password.',
    ])}
    ${(0, layout_1.para)('If you did not ask for this, ignore this email: your password will not change. If you receive several of these without asking, tell your administrator.', 'small')}`;
    return {
        subject: 'Reset your EJO 100 password',
        html: (0, layout_1.renderEmailLayout)({
            previewText: 'Use this link within 1 hour to choose a new password.',
            companyName: o.companyName,
            logoUrl: o.logoUrl,
            status: { label: 'Security', tone: 'info' },
            heading: 'Reset your password',
            bodyHtml,
            ctaLabel: 'Choose a new password',
            ctaUrl: o.url,
            showLinkFallback: true,
            reason: 'You are receiving this because a password reset was requested for your EJO 100 account.',
        }),
    };
}
