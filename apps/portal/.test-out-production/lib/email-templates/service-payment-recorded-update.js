"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderServicePaymentRecordedUpdateEmail = renderServicePaymentRecordedUpdateEmail;
const layout_1 = require("./layout");
function renderServicePaymentRecordedUpdateEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`A payment of ${o.amountReceived} was recorded on Vehicle Service ${o.serviceNumber} for ${o.customerName}.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
        ['This payment', o.amountReceived],
        ['Paid so far', `${o.totalPaidSoFar} of ${o.totalEstimate}`],
        ['Balance due', o.balanceRemaining],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.amountReceived} recorded on Vehicle Service ${o.serviceNumber}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Payment recorded', tone: 'success' },
        heading: `Payment recorded on ${o.serviceNumber}`,
        bodyHtml,
        ctaLabel: 'Open Vehicle Service',
        ctaUrl: o.serviceUrl,
        audience: 'staff',
    });
}
