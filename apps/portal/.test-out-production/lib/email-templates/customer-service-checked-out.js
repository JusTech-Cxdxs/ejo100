"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerServiceCheckedOutEmail = renderCustomerServiceCheckedOutEmail;
const layout_1 = require("./layout");
/** Confirms the vehicle left the branch after a Vehicle Service, and who collected it. */
function renderCustomerServiceCheckedOutEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`This confirms that your ${o.vehicleDescription} has been collected from ${o.branchName || 'the branch'}.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Vehicle', o.vehicleDescription],
        ['Collected by', o.collectedByName],
    ])}
    ${(0, layout_1.callout)('If you did not collect the vehicle yourself or authorise this person to collect it, contact the branch straight away.', 'warning')}
    ${(0, layout_1.para)(`Thank you for choosing ${o.companyName}. We will remind you when the next routine service is due.`)}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Your ${o.vehicleDescription} was collected by ${o.collectedByName}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Collected', tone: 'success' },
        heading: 'Your vehicle has been collected',
        bodyHtml,
        ctaLabel: 'View in customer portal',
        ctaUrl: o.dashboardUrl,
        audience: 'customer',
    });
}
