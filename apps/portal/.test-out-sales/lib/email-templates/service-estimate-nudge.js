"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderServiceEstimateNudgeEmail = renderServiceEstimateNudgeEmail;
const layout_1 = require("./layout");
/** A colleague asks the recipient to look at the estimate (add pricing, or check the figures). */
function renderServiceEstimateNudgeEmail(o) {
    const ask = o.fromRole === 'supervisor'
        ? 'add or confirm the pricing on the parts and work you sourced'
        : 'check the pricing and figures entered so far';
    const note = o.note?.trim();
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.fromName} has asked you to look at the estimate on Vehicle Service ${o.serviceNumber} for ${o.customerName} and ${ask}.`)}
    ${note ? (0, layout_1.callout)(note, 'info', `Note from ${o.fromName}`) : ''}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
        ['Requested by', o.fromName],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.fromName} asked you to look at the estimate on Vehicle Service ${o.serviceNumber}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Your input needed', tone: 'warning' },
        heading: `Please look at the estimate for ${o.serviceNumber}`,
        bodyHtml,
        ctaLabel: 'Open Vehicle Service',
        ctaUrl: o.vehicleServiceUrl,
        audience: 'staff',
    });
}
