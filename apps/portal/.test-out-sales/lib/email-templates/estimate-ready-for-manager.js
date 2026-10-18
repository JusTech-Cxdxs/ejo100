"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderEstimateReadyForManagerEmail = renderEstimateReadyForManagerEmail;
const layout_1 = require("./layout");
/** The supervisor validated the estimate; the manager approves it before the customer sees it. */
function renderEstimateReadyForManagerEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.managerName)}
    ${(0, layout_1.para)(`${o.approvedByName} has validated the estimate on Job Card ${o.jobNumber} for ${o.customerName}. It needs your approval before the customer can be told.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['Validated by', o.approvedByName],
        ['Estimate total', o.totalAmount],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Estimate of ${o.totalAmount} on Job Card ${o.jobNumber} is waiting for your approval.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Approval needed', tone: 'warning' },
        heading: `Estimate for ${o.jobNumber} needs your approval`,
        bodyHtml,
        ctaLabel: 'Review estimate',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
