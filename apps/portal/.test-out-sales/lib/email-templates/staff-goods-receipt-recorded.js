"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderStaffGoodsReceiptRecordedEmail = renderStaffGoodsReceiptRecordedEmail;
const layout_1 = require("./layout");
function renderStaffGoodsReceiptRecordedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.recordedByName} recorded goods receipt ${o.referenceNumber}: ${o.quantityLabel} of ${o.partName} from ${o.supplierName}.`)}
    ${(0, layout_1.details)([
        ['Goods receipt', o.referenceNumber],
        ['Part', o.partName],
        ['Quantity received', o.quantityLabel],
        ['Added to stock', o.quantityInBaseUnitLabel],
        ['Supplier', o.supplierName],
        ['Batch number', o.batchNumber],
        ['Serial numbers', o.serialNumbers?.length ? o.serialNumbers.join(', ') : null],
        ['Recorded by', o.recordedByName],
    ])}
    ${o.notes?.trim() ? (0, layout_1.callout)(o.notes.trim(), 'neutral', 'Notes') : ''}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.referenceNumber}: ${o.quantityLabel} of ${o.partName} received from ${o.supplierName}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Stock received', tone: 'success' },
        heading: `Goods receipt ${o.referenceNumber} recorded`,
        bodyHtml,
        ctaLabel: 'View in Inventory',
        ctaUrl: o.dashboardUrl,
        audience: 'staff',
    });
}
