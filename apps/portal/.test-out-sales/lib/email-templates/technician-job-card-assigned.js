"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTechnicianJobCardAssignedEmail = renderTechnicianJobCardAssignedEmail;
const layout_1 = require("./layout");
function renderTechnicianJobCardAssignedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.technicianName)}
    ${(0, layout_1.para)(`${o.supervisorName} has assigned you to Job Card ${o.jobNumber}. Please review the details and accept the assignment, or decline it with a reason.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['Vehicle', o.vehicleDescription],
        ['Assigned by', o.supervisorName],
    ])}
    ${(0, layout_1.sectionTitle)("Customer's complaints")}
    ${o.complaints.length ? (0, layout_1.list)(o.complaints, true) : (0, layout_1.para)('No complaints recorded.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.supervisorName} assigned you to Job Card ${o.jobNumber}. Please accept or decline.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Response needed', tone: 'warning' },
        heading: `You are assigned to ${o.jobNumber}`,
        bodyHtml,
        ctaLabel: 'Review and respond',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
