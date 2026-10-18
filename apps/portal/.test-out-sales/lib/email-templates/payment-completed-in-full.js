"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPaymentCompletedInFullEmail = renderPaymentCompletedInFullEmail;
const layout_1 = require("./layout");
function renderPaymentCompletedInFullEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.customerName} has paid Job Card ${o.jobNumber} in full.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['Total paid', o.totalPaid],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Job Card ${o.jobNumber} is paid in full (${o.totalPaid}).`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Paid in full', tone: 'success' },
        heading: `Job Card ${o.jobNumber} paid in full`,
        bodyHtml,
        ctaLabel: 'Open Job Card',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
