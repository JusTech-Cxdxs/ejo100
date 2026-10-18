"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderServicePaymentCompletedInFullEmail = renderServicePaymentCompletedInFullEmail;
const layout_1 = require("./layout");
function renderServicePaymentCompletedInFullEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.customerName} has paid Vehicle Service ${o.serviceNumber} in full.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
        ['Total paid', o.totalPaid],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Vehicle Service ${o.serviceNumber} is paid in full (${o.totalPaid}).`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Paid in full', tone: 'success' },
        heading: `Vehicle Service ${o.serviceNumber} paid in full`,
        bodyHtml,
        ctaLabel: 'Open Vehicle Service',
        ctaUrl: o.serviceUrl,
        audience: 'staff',
    });
}
