"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderServiceCancellationRequestedEmail = renderServiceCancellationRequestedEmail;
const layout_1 = require("./layout");
function renderServiceCancellationRequestedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.managerName)}
    ${(0, layout_1.para)(`${o.requestedByName} has asked to cancel Vehicle Service ${o.serviceNumber} for ${o.customerName}. Please review the request and approve or decline it.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
        ['Requested by', o.requestedByName],
    ])}
    ${o.reason?.trim() ? (0, layout_1.callout)(o.reason.trim(), 'warning', 'Reason given') : ''}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.requestedByName} asked to cancel Vehicle Service ${o.serviceNumber}. Your decision is needed.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Decision needed', tone: 'warning' },
        heading: `Cancellation request for ${o.serviceNumber}`,
        bodyHtml,
        ctaLabel: 'Review request',
        ctaUrl: o.serviceUrl,
        audience: 'staff',
    });
}
