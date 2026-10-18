"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTechnicianVehicleServiceAssignedEmail = renderTechnicianVehicleServiceAssignedEmail;
const layout_1 = require("./layout");
function renderTechnicianVehicleServiceAssignedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.technicianName)}
    ${(0, layout_1.para)(`${o.supervisorName} has assigned you to Vehicle Service ${o.serviceNumber}. Please open it to accept the assignment or say why you cannot take it.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
        ['Vehicle', o.vehicleDescription],
        ['Assigned by', o.supervisorName],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.supervisorName} assigned you to Vehicle Service ${o.serviceNumber} (${o.vehicleDescription}).`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Assigned to you', tone: 'warning' },
        heading: `You are assigned to ${o.serviceNumber}`,
        bodyHtml,
        ctaLabel: 'Open Vehicle Service',
        ctaUrl: o.serviceUrl,
        audience: 'staff',
    });
}
