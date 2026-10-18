"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderWorkflowNoticeEmail = renderWorkflowNoticeEmail;
const layout_1 = require("./layout");
function renderWorkflowNoticeEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(o.intro)}
    ${(0, layout_1.details)(o.facts ?? [])}
    ${o.next ? (0, layout_1.callout)(o.next, o.status.tone === 'danger' ? 'warning' : o.status.tone, 'What to do') : ''}`;
    return {
        subject: o.subject.slice(0, 160),
        html: (0, layout_1.renderEmailLayout)({ previewText: o.intro.slice(0, 120), companyName: o.companyName, logoUrl: o.logoUrl, orgContext: (o.orgContext ?? []).filter((x) => Boolean(x)), status: o.status, heading: o.heading, bodyHtml, ctaLabel: o.ctaLabel, ctaUrl: o.url, audience: 'staff' }),
    };
}
