"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderSupervisorJobCardAssignedEmail = renderSupervisorJobCardAssignedEmail;
const layout_1 = require("./layout");
function renderSupervisorJobCardAssignedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.supervisorName)}
    ${(0, layout_1.para)(`A new Job Card has been opened${o.departmentName ? ` in ${o.departmentName}` : ''} and assigned to you. Please review the vehicle and the customer's complaints, then start your inspection.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['Vehicle', o.vehicleDescription],
    ])}
    ${(0, layout_1.sectionTitle)("Customer's complaints")}
    ${o.complaints.length ? (0, layout_1.list)(o.complaints, true) : (0, layout_1.para)('No complaints recorded.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Job Card ${o.jobNumber} for ${o.customerName} (${o.vehicleDescription}) is assigned to you.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Assigned to you', tone: 'warning' },
        heading: `New Job Card ${o.jobNumber}`,
        bodyHtml,
        ctaLabel: 'Open Job Card',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
