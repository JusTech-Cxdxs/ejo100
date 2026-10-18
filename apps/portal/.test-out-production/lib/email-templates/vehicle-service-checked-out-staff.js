"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderVehicleServiceCheckedOutStaffEmail = renderVehicleServiceCheckedOutStaffEmail;
const layout_1 = require("./layout");
function renderVehicleServiceCheckedOutStaffEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`The vehicle on Vehicle Service ${o.serviceNumber} for ${o.customerName} has been checked out and has left the branch.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
        ['Collected by', o.collectedByName],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Vehicle Service ${o.serviceNumber}: vehicle collected by ${o.collectedByName}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Checked out', tone: 'success' },
        heading: 'Vehicle checked out',
        bodyHtml,
        ctaLabel: 'Open Vehicle Service',
        ctaUrl: o.serviceUrl,
        audience: 'staff',
    });
}
