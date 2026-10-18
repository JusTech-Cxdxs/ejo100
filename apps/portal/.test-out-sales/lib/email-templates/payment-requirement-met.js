"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPaymentRequirementMetEmail = renderPaymentRequirementMetEmail;
const layout_1 = require("./layout");
function renderPaymentRequirementMetEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.customerName} has paid the required deposit on Job Card ${o.jobNumber}. Work can start now.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['Paid so far', `${o.totalPaidSoFar} of ${o.totalEstimate}`],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Deposit paid on Job Card ${o.jobNumber}. Work can start.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Ready to start', tone: 'success' },
        heading: `Deposit paid on ${o.jobNumber}`,
        bodyHtml,
        ctaLabel: 'Open Job Card',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
