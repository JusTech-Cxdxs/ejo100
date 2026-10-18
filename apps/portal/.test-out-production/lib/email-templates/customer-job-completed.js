"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerJobCompletedEmail = renderCustomerJobCompletedEmail;
const layout_1 = require("./layout");
/** The vehicle passed the final quality inspection; collection details follow in a separate email. */
function renderCustomerJobCompletedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`Your ${o.vehicleDescription} has passed our final quality inspection. We are now preparing it for collection and will email you shortly with the collection details.`)}
    ${o.afterRework ? (0, layout_1.callout)('The additional work we told you about is complete.', 'success') : ''}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Vehicle', o.vehicleDescription],
        ['Status', 'Passed quality inspection'],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Your ${o.vehicleDescription} has passed its final quality inspection.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Inspection passed', tone: 'success' },
        heading: 'Your vehicle passed its quality inspection',
        bodyHtml,
        ctaLabel: 'Follow progress',
        ctaUrl: o.dashboardUrl,
        audience: 'customer',
    });
}
