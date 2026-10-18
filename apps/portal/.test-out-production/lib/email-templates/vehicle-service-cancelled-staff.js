"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderVehicleServiceCancelledStaffEmail = renderVehicleServiceCancelledStaffEmail;
const layout_1 = require("./layout");
function renderVehicleServiceCancelledStaffEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.approvedByName} approved the cancellation of Vehicle Service ${o.serviceNumber} for ${o.customerName}. Stop any work on it; no further work is needed.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
        ['Approved by', o.approvedByName],
    ])}
    ${o.reason?.trim() ? (0, layout_1.callout)(o.reason.trim(), 'neutral', 'Reason') : ''}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Vehicle Service ${o.serviceNumber} for ${o.customerName} is cancelled.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Cancelled', tone: 'danger' },
        heading: `Vehicle Service ${o.serviceNumber} cancelled`,
        bodyHtml,
        ctaLabel: 'Open Vehicle Service',
        ctaUrl: o.serviceUrl,
        audience: 'staff',
    });
}
