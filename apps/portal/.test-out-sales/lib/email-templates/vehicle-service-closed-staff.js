"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderVehicleServiceClosedStaffEmail = renderVehicleServiceClosedStaffEmail;
const layout_1 = require("./layout");
function renderVehicleServiceClosedStaffEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.closedByName} closed Vehicle Service ${o.serviceNumber} for ${o.customerName}. The work and payment are settled and the record is now read-only.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
        ['Closed by', o.closedByName],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.closedByName} closed Vehicle Service ${o.serviceNumber}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Closed', tone: 'success' },
        heading: `Vehicle Service ${o.serviceNumber} closed`,
        bodyHtml,
        ctaLabel: 'Open Vehicle Service',
        ctaUrl: o.serviceUrl,
        audience: 'staff',
    });
}
