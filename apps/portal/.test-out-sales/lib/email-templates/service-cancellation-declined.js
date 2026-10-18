"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderServiceCancellationDeclinedEmail = renderServiceCancellationDeclinedEmail;
const layout_1 = require("./layout");
function renderServiceCancellationDeclinedEmail(o) {
    const notes = o.decisionNotes?.trim();
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.declinedByName} declined your request to cancel Vehicle Service ${o.serviceNumber} for ${o.customerName}. The Vehicle Service stays open and work continues as normal.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
        ['Declined by', o.declinedByName],
    ])}
    ${notes ? (0, layout_1.callout)(notes, 'neutral', 'Note from the manager') : ''}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Your request to cancel Vehicle Service ${o.serviceNumber} was declined.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Declined', tone: 'danger' },
        heading: 'Cancellation request declined',
        bodyHtml,
        ctaLabel: 'Open Vehicle Service',
        ctaUrl: o.serviceUrl,
        audience: 'staff',
    });
}
