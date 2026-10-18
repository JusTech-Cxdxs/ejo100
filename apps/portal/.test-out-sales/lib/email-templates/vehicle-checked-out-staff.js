"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderVehicleCheckedOutStaffEmail = renderVehicleCheckedOutStaffEmail;
const layout_1 = require("./layout");
function renderVehicleCheckedOutStaffEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`The vehicle on Job Card ${o.jobNumber} for ${o.customerName} has been checked out and has left the branch.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['Collected by', o.collectedByName],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Job Card ${o.jobNumber}: vehicle collected by ${o.collectedByName}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Checked out', tone: 'success' },
        heading: 'Vehicle checked out',
        bodyHtml,
        ctaLabel: 'Open Job Card',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
