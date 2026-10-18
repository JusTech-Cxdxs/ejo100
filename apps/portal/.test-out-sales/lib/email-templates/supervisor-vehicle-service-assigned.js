"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderSupervisorVehicleServiceAssignedEmail = renderSupervisorVehicleServiceAssignedEmail;
const layout_1 = require("./layout");
function renderSupervisorVehicleServiceAssignedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.supervisorName)}
    ${(0, layout_1.para)(`A new Vehicle Service has been opened${o.departmentName ? ` in ${o.departmentName}` : ''} and assigned to you. Please review the vehicle and the customer's requests, then approve it so work can start.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
        ['Vehicle', o.vehicleDescription],
    ])}
    ${(0, layout_1.sectionTitle)("Customer's requests")}
    ${o.reasons.length ? (0, layout_1.list)(o.reasons, true) : (0, layout_1.para)('No additional requests recorded.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Vehicle Service ${o.serviceNumber} for ${o.customerName} is assigned to you.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Assigned to you', tone: 'warning' },
        heading: `New Vehicle Service ${o.serviceNumber}`,
        bodyHtml,
        ctaLabel: 'Open Vehicle Service',
        ctaUrl: o.serviceUrl,
        audience: 'staff',
    });
}
