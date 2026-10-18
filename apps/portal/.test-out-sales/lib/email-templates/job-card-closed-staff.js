"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderJobCardClosedStaffEmail = renderJobCardClosedStaffEmail;
const layout_1 = require("./layout");
function renderJobCardClosedStaffEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.closedByName} closed Job Card ${o.jobNumber} for ${o.customerName}. The work and payment are settled and the record is now read-only.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['Closed by', o.closedByName],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.closedByName} closed Job Card ${o.jobNumber}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Closed', tone: 'success' },
        heading: `Job Card ${o.jobNumber} closed`,
        bodyHtml,
        ctaLabel: 'Open Job Card',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
