"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderVehicleServiceEscalatedStaffEmail = renderVehicleServiceEscalatedStaffEmail;
const layout_1 = require("./layout");
/** A Vehicle Service found work beyond routine maintenance and moved to a Job Card. */
function renderVehicleServiceEscalatedStaffEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.escalatedByName} moved Vehicle Service ${o.serviceNumber} for ${o.customerName} to Job Card ${o.jobNumber}, because the work needed goes beyond routine maintenance.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', `${o.serviceNumber} (now closed)`],
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['Moved by', o.escalatedByName],
    ])}
    ${(0, layout_1.callout)('The Vehicle Service is now closed and read-only. The estimate, payment and check-out continue on the Job Card, and the next-service count starts when the Job Card is checked out.', 'info')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Vehicle Service ${o.serviceNumber} continues as Job Card ${o.jobNumber}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Escalated', tone: 'info' },
        heading: `${o.serviceNumber} moved to Job Card ${o.jobNumber}`,
        bodyHtml,
        ctaLabel: `Open Job Card ${o.jobNumber}`,
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
