"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderGoodsReceiptEditedEmail = renderGoodsReceiptEditedEmail;
const layout_1 = require("./layout");
function renderGoodsReceiptEditedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.editedByName} edited goods receipt ${o.referenceNumber}. Stock and costs have been updated to match.`)}
    ${(0, layout_1.callout)(o.changeSummary, 'warning', 'What changed')}
    ${(0, layout_1.details)([
        ['Goods receipt', o.referenceNumber],
        ['Edited by', o.editedByName],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.editedByName} edited goods receipt ${o.referenceNumber}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Edited', tone: 'warning' },
        heading: `Goods receipt ${o.referenceNumber} edited`,
        bodyHtml,
        ctaLabel: 'View goods receipts',
        ctaUrl: o.goodsReceiptUrl,
        audience: 'staff',
    });
}
