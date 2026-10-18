"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderEstimateSubmittedEmail = renderEstimateSubmittedEmail;
const layout_1 = require("./layout");
/** The technician finished the estimate; the supervisor checks and validates it. */
function renderEstimateSubmittedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.supervisorName)}
    ${(0, layout_1.para)(`${o.submittedByName} has finished the estimate on Job Card ${o.jobNumber} for ${o.customerName} and sent it to you. Please check it, correct anything that needs it, and validate it.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['Prepared by', o.submittedByName],
        ['Estimate total', o.totalAmount],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.submittedByName} sent you the estimate on Job Card ${o.jobNumber} (${o.totalAmount}).`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Validation needed', tone: 'warning' },
        heading: `Estimate for ${o.jobNumber} needs your validation`,
        bodyHtml,
        ctaLabel: 'Review estimate',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
