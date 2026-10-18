"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerRefundReceiptEmail = renderCustomerRefundReceiptEmail;
const layout_1 = require("./layout");
/** The customer's receipt for each refund payment. */
function renderCustomerRefundReceiptEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`We have refunded ${o.amount} relating to ${o.recordLabel} ${o.recordNumber} for your ${o.vehicleDescription}. Please keep this email as your receipt.`)}
    ${(0, layout_1.highlight)('Amount refunded', o.amount, o.remaining ? `Still to be refunded: ${o.remaining}` : 'Your refund is complete.', 'success')}
    ${(0, layout_1.details)([
        ['Refund receipt', o.referenceNumber],
        [o.recordLabel, o.recordNumber],
        ['Refunded by', o.method],
        ['Received by', o.paidToName],
        ['Total refunded so far', o.totalRefunded],
        ['Still to be refunded', o.remaining],
    ])}
    ${o.remaining ? (0, layout_1.para)('The rest of the refund will follow. You will receive a receipt like this one for each payment.', 'small') : ''}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Refund receipt ${o.referenceNumber}: ${o.amount} refunded.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: o.remaining ? 'Part refund' : 'Refund complete', tone: 'success' },
        heading: 'Your refund receipt',
        bodyHtml,
        ctaLabel: 'View in customer portal',
        ctaUrl: o.dashboardUrl,
        audience: 'customer',
    });
}
