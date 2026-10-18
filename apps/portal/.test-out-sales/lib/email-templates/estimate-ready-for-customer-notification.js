"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderEstimateReadyForCustomerNotificationEmail = renderEstimateReadyForCustomerNotificationEmail;
const layout_1 = require("./layout");
/** To whoever opened the Job Card: the manager approved the estimate, so the customer can now be told. */
function renderEstimateReadyForCustomerNotificationEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.approvedByManagerName} approved the estimate on Job Card ${o.jobNumber} for ${o.customerName}. Please give it a final check, then send it to the customer from the Job Card.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['Approved by', o.approvedByManagerName],
        ['Estimate total', o.totalAmount],
    ])}
    ${(0, layout_1.para)('The customer receives the estimate, the deposit due and the payment details by email once you notify them.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `The estimate on ${o.jobNumber} is approved and ready to send to ${o.customerName}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Ready for the customer', tone: 'success' },
        heading: `Estimate for ${o.jobNumber} approved by the manager`,
        bodyHtml,
        ctaLabel: 'Review and notify customer',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
