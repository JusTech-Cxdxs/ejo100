"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCancellationRequestedEmail = renderCancellationRequestedEmail;
const layout_1 = require("./layout");
/** To each workshop manager of the branch when someone asks to cancel a Job Card. */
function renderCancellationRequestedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.managerName)}
    ${(0, layout_1.para)(`${o.requestedByName} has asked to cancel Job Card ${o.jobNumber} for ${o.customerName}. Please review the request and approve or decline it.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['Requested by', o.requestedByName],
    ])}
    ${o.reason?.trim() ? (0, layout_1.callout)(o.reason.trim(), 'warning', 'Reason given') : ''}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.requestedByName} asked to cancel Job Card ${o.jobNumber}. Your decision is needed.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Decision needed', tone: 'warning' },
        heading: `Cancellation request for ${o.jobNumber}`,
        bodyHtml,
        ctaLabel: 'Review request',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
