"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerJobInProgressEmail = renderCustomerJobInProgressEmail;
const layout_1 = require("./layout");
/** Sent once, when work on a Job Card starts. */
function renderCustomerJobInProgressEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`Our technicians have started work on your ${o.vehicleDescription}. We will email you again when the work has passed our quality checks and when the vehicle is ready for collection.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Vehicle', o.vehicleDescription],
        ['Status', 'Work in progress'],
    ])}
    ${(0, layout_1.para)('There is nothing you need to do for now. You can follow each step in your customer portal.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Our technicians have started work on your ${o.vehicleDescription}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'In progress', tone: 'info' },
        heading: 'Work on your vehicle has started',
        bodyHtml,
        ctaLabel: 'Follow progress',
        ctaUrl: o.dashboardUrl,
        audience: 'customer',
    });
}
