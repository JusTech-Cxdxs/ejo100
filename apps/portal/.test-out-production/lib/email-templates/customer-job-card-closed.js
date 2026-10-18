"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerJobCardClosedEmail = renderCustomerJobCardClosedEmail;
const layout_1 = require("./layout");
function renderCustomerJobCardClosedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`Job Card ${o.jobNumber} for your ${o.vehicleDescription} is now closed. The work and payment are fully settled, and the full record stays available in your customer portal.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Vehicle', o.vehicleDescription],
        ['Status', 'Closed'],
    ])}
    ${(0, layout_1.para)(`Thank you for choosing ${o.companyName}.`)}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Job Card ${o.jobNumber} is closed. Thank you for choosing ${o.companyName}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Closed', tone: 'success' },
        heading: 'Your Job Card is closed',
        bodyHtml,
        ctaLabel: 'View in customer portal',
        ctaUrl: o.dashboardUrl,
        audience: 'customer',
    });
}
