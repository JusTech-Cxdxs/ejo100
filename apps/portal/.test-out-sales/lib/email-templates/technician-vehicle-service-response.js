"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTechnicianVehicleServiceResponseEmail = renderTechnicianVehicleServiceResponseEmail;
const layout_1 = require("./layout");
/** To the supervisor: the technician accepted or declined the Vehicle Service assignment. */
function renderTechnicianVehicleServiceResponseEmail(o) {
    const accepted = o.response === 'ACCEPTED';
    const reason = o.rejectionReason?.trim();
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.supervisorName)}
    ${accepted
        ? (0, layout_1.para)(`${o.technicianName} accepted the assignment on Vehicle Service ${o.serviceNumber} for ${o.customerName} and can start work.`)
        : (0, layout_1.para)(`${o.technicianName} declined the assignment on Vehicle Service ${o.serviceNumber} for ${o.customerName}. Please assign another technician.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
        ['Technician', o.technicianName],
    ])}
    ${!accepted && reason ? (0, layout_1.callout)(reason, 'danger', 'Reason given') : ''}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: accepted ? `${o.technicianName} accepted Vehicle Service ${o.serviceNumber}.` : `${o.technicianName} declined Vehicle Service ${o.serviceNumber}. It needs a new technician.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: accepted ? { label: 'Accepted', tone: 'success' } : { label: 'Needs reassigning', tone: 'danger' },
        heading: accepted ? `${o.technicianName} accepted ${o.serviceNumber}` : `${o.technicianName} declined ${o.serviceNumber}`,
        bodyHtml,
        ctaLabel: accepted ? 'Open Vehicle Service' : 'Reassign technician',
        ctaUrl: o.serviceUrl,
        audience: 'staff',
    });
}
