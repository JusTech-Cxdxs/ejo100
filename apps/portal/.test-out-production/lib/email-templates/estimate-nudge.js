"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderEstimateNudgeEmail = renderEstimateNudgeEmail;
const layout_1 = require("./layout");
/** A colleague asks the recipient to look at the estimate (add pricing, or check the figures). */
function renderEstimateNudgeEmail(o) {
    const ask = o.fromRole === 'supervisor'
        ? 'add or confirm the pricing on the parts and work you sourced'
        : 'check the pricing and figures entered so far';
    const note = o.note?.trim();
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.fromName} has asked you to look at the estimate on Job Card ${o.jobNumber} for ${o.customerName} and ${ask}.`)}
    ${note ? (0, layout_1.callout)(note, 'info', `Note from ${o.fromName}`) : ''}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['Requested by', o.fromName],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.fromName} asked you to look at the estimate on Job Card ${o.jobNumber}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Your input needed', tone: 'warning' },
        heading: `Please look at the estimate for ${o.jobNumber}`,
        bodyHtml,
        ctaLabel: 'Open Job Card',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
