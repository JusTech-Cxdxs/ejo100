"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerServicePaymentReceivedEmail = renderCustomerServicePaymentReceivedEmail;
const layout_1 = require("./layout");
/** A receipt-style confirmation each time the branch records a Vehicle Service payment. */
function renderCustomerServicePaymentReceivedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`Thank you. We have received your payment towards Vehicle Service ${o.serviceNumber}.`)}
    ${(0, layout_1.highlight)('Amount received', o.amountReceived, o.balanceRemaining ? `Balance still due: ${o.balanceRemaining}` : 'This service is now paid in full.', 'success')}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Estimate total', o.totalEstimate],
        ['Paid so far', o.totalPaidSoFar],
        ['Balance due', o.balanceRemaining ?? 'None (paid in full)'],
    ])}
    ${(0, layout_1.para)('Keep this email as your confirmation. Your full payment history is in your customer portal.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Payment of ${o.amountReceived} received for Vehicle Service ${o.serviceNumber}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: o.balanceRemaining ? 'Payment received' : 'Paid in full', tone: 'success' },
        heading: 'Payment received',
        bodyHtml,
        ctaLabel: 'View payments',
        ctaUrl: o.serviceUrl,
        audience: 'customer',
    });
}
