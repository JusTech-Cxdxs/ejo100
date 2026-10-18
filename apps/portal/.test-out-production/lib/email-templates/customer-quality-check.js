"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerQualityCheckEmail = renderCustomerQualityCheckEmail;
const layout_1 = require("./layout");
/** Sent once, when the work is done and the vehicle goes to quality checks. */
function renderCustomerQualityCheckEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`The work on your ${o.vehicleDescription} is finished. Our quality team is now carrying out final checks, including a road test, before the vehicle is handed back to you.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Vehicle', o.vehicleDescription],
        ['Status', 'Final quality checks'],
    ])}
    ${(0, layout_1.para)('We will email you when the checks are complete.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Work on your ${o.vehicleDescription} is finished and in final quality checks.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Quality checks', tone: 'info' },
        heading: 'Your vehicle is in final checks',
        bodyHtml,
        ctaLabel: 'Follow progress',
        ctaUrl: o.dashboardUrl,
        audience: 'customer',
    });
}
