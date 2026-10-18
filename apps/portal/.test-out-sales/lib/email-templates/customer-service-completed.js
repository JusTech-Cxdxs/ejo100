"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerServiceCompletedEmail = renderCustomerServiceCompletedEmail;
const layout_1 = require("./layout");
/** The routine service is done; collection details follow in a separate email. */
function renderCustomerServiceCompletedEmail(o) {
    const due = [o.nextServiceDueMileage ? `at ${o.nextServiceDueMileage}` : null, o.nextServiceDueDate ? `by ${o.nextServiceDueDate}` : null].filter(Boolean).join(' or ');
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`The service on your ${o.vehicleDescription} is complete. We are preparing it for collection and will email you shortly with the collection details.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Vehicle', o.vehicleDescription],
        ['Status', 'Service complete'],
    ])}
    ${due ? (0, layout_1.highlight)('Next service due', due, o.nextServiceDueMileage && o.nextServiceDueDate ? 'Whichever comes first. We will remind you as it gets close.' : 'We will remind you as it gets close.', 'success') : ''}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `The service on your ${o.vehicleDescription} is complete.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Service complete', tone: 'success' },
        heading: 'Your vehicle service is complete',
        bodyHtml,
        ctaLabel: 'Follow progress',
        ctaUrl: o.dashboardUrl,
        audience: 'customer',
    });
}
