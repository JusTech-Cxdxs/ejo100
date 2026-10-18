"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTechnicianResponseEmail = renderTechnicianResponseEmail;
const layout_1 = require("./layout");
/** To the supervisor: the technician accepted or declined the Job Card assignment. */
function renderTechnicianResponseEmail(o) {
    const accepted = o.response === 'ACCEPTED';
    const reason = o.rejectionReason?.trim();
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.supervisorName)}
    ${accepted
        ? (0, layout_1.para)(`${o.technicianName} accepted the assignment on Job Card ${o.jobNumber} for ${o.customerName} and can start work.`)
        : (0, layout_1.para)(`${o.technicianName} declined the assignment on Job Card ${o.jobNumber} for ${o.customerName}. Please assign another technician.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['Technician', o.technicianName],
    ])}
    ${!accepted && reason ? (0, layout_1.callout)(reason, 'danger', 'Reason given') : ''}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: accepted ? `${o.technicianName} accepted Job Card ${o.jobNumber}.` : `${o.technicianName} declined Job Card ${o.jobNumber}. It needs a new technician.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: accepted ? { label: 'Accepted', tone: 'success' } : { label: 'Needs reassigning', tone: 'danger' },
        heading: accepted ? `${o.technicianName} accepted ${o.jobNumber}` : `${o.technicianName} declined ${o.jobNumber}`,
        bodyHtml,
        ctaLabel: accepted ? 'Open Job Card' : 'Reassign technician',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
