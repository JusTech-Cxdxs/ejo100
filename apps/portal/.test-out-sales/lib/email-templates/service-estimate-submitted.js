"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderServiceEstimateSubmittedEmail = renderServiceEstimateSubmittedEmail;
const layout_1 = require("./layout");
function renderServiceEstimateSubmittedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.submittedByName} has finished the estimate on Vehicle Service ${o.serviceNumber} for ${o.customerName} and sent it to you for approval.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
        ['Prepared by', o.submittedByName],
        ['Estimate total', o.totalAmount],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.submittedByName} sent you the estimate on ${o.serviceNumber} (${o.totalAmount}).`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Approval needed', tone: 'warning' },
        heading: `Estimate for ${o.serviceNumber} needs your approval`,
        bodyHtml,
        ctaLabel: 'Review estimate',
        ctaUrl: o.serviceUrl,
        audience: 'staff',
    });
}
