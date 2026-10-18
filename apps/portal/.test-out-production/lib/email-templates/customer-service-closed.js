"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerServiceClosedEmail = renderCustomerServiceClosedEmail;
const layout_1 = require("./layout");
function renderCustomerServiceClosedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`Vehicle Service ${o.serviceNumber} for your ${o.vehicleDescription} is now closed. The work and payment are fully settled, and the full record stays available in your customer portal.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Vehicle', o.vehicleDescription],
        ['Status', 'Closed'],
    ])}
    ${(0, layout_1.para)(`Thank you for choosing ${o.companyName}.`)}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Vehicle Service ${o.serviceNumber} is closed. Thank you for choosing ${o.companyName}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Closed', tone: 'success' },
        heading: 'Your vehicle service is closed',
        bodyHtml,
        ctaLabel: 'View in customer portal',
        ctaUrl: o.dashboardUrl,
        audience: 'customer',
    });
}
