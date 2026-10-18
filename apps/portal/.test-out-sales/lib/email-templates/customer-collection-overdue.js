"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerCollectionOverdueEmail = renderCustomerCollectionOverdueEmail;
const layout_1 = require("./layout");
const ordinal_1 = require("../utils/ordinal");
/** A cancelled Job Card whose vehicle is still at the branch. */
function renderCustomerCollectionOverdueEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`Job Card ${o.jobNumber} for your ${o.vehicleDescription} was cancelled ${o.daysSinceCancellationLabel} ago, and the vehicle is still with us at ${o.branchName || 'the branch'}. Please arrange to collect it as soon as you can.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Vehicle', o.vehicleDescription],
        ['Cancelled', `${o.daysSinceCancellationLabel} ago`],
        ['Reminder', `${(0, ordinal_1.ordinal)(Math.max(1, o.reminderNumber))} reminder`],
    ])}
    ${(0, layout_1.para)('If you need a different arrangement, please contact the branch and we will work it out with you.')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Your ${o.vehicleDescription} is still at the branch. Please arrange collection.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Collection needed', tone: 'warning' },
        heading: 'Please collect your vehicle',
        bodyHtml,
        ctaLabel: 'View in customer portal',
        ctaUrl: o.dashboardUrl,
        audience: 'customer',
    });
}
