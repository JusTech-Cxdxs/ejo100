"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPaymentRecordedUpdateEmail = renderPaymentRecordedUpdateEmail;
const layout_1 = require("./layout");
function renderPaymentRecordedUpdateEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`A payment of ${o.amountReceived} was recorded on Job Card ${o.jobNumber} for ${o.customerName}.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['This payment', o.amountReceived],
        ['Paid so far', `${o.totalPaidSoFar} of ${o.totalEstimate}`],
        ['Balance due', o.balanceRemaining],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.amountReceived} recorded on Job Card ${o.jobNumber}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Payment recorded', tone: 'success' },
        heading: `Payment recorded on ${o.jobNumber}`,
        bodyHtml,
        ctaLabel: 'Open Job Card',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
