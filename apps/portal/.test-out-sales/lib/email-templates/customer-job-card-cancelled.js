"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerJobCardCancelledEmail = renderCustomerJobCardCancelledEmail;
const layout_1 = require("./layout");
function renderCustomerJobCardCancelledEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`As requested, Job Card ${o.jobNumber} for your ${o.vehicleDescription} has been cancelled. No further work will be carried out under it.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Vehicle', o.vehicleDescription],
        ['Status', 'Cancelled'],
    ])}
    ${(0, layout_1.para)('If your vehicle is still with us, please arrange to collect it. If you paid anything towards this job, the branch will contact you about it. Whenever you need us again, we will be glad to help.')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Job Card ${o.jobNumber} for your ${o.vehicleDescription} has been cancelled.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Cancelled', tone: 'neutral' },
        heading: 'Your Job Card has been cancelled',
        bodyHtml,
        ctaLabel: 'View in customer portal',
        ctaUrl: o.dashboardUrl,
        audience: 'customer',
    });
}
