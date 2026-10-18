"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderServicePaymentRequirementMetEmail = renderServicePaymentRequirementMetEmail;
const layout_1 = require("./layout");
function renderServicePaymentRequirementMetEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.customerName} has paid the required deposit on Vehicle Service ${o.serviceNumber}. Work can start now.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
        ['Paid so far', `${o.totalPaidSoFar} of ${o.totalEstimate}`],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Deposit paid on ${o.serviceNumber}. Work can start.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Ready to start', tone: 'success' },
        heading: `Deposit paid on ${o.serviceNumber}`,
        bodyHtml,
        ctaLabel: 'Open Vehicle Service',
        ctaUrl: o.serviceUrl,
        audience: 'staff',
    });
}
