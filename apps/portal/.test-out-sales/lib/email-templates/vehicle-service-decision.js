"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderVehicleServiceDecisionEmail = renderVehicleServiceDecisionEmail;
const layout_1 = require("./layout");
/** To whoever opened a Vehicle Service, when the supervisor approves it or returns it for correction. */
function renderVehicleServiceDecisionEmail(o) {
    const approved = o.decision === 'APPROVED';
    const notes = o.notes?.trim();
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${approved
        ? (0, layout_1.para)(`${o.approverName} approved Vehicle Service ${o.serviceNumber} for ${o.customerName}. The work can now go ahead.`)
        : (0, layout_1.para)(`${o.approverName} returned Vehicle Service ${o.serviceNumber} for ${o.customerName} for correction. Please make the changes below and submit it again.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
        [approved ? 'Approved by' : 'Returned by', o.approverName],
    ])}
    ${!approved && o.rejectionReason?.trim() ? (0, layout_1.callout)(o.rejectionReason.trim(), 'danger', 'What needs correcting') : ''}
    ${notes ? (0, layout_1.callout)(notes, 'neutral', 'Notes') : ''}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: approved ? `${o.approverName} approved Vehicle Service ${o.serviceNumber}.` : `Vehicle Service ${o.serviceNumber} needs correcting before it can go ahead.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: approved ? { label: 'Approved', tone: 'success' } : { label: 'Returned for correction', tone: 'danger' },
        heading: approved ? `Vehicle Service ${o.serviceNumber} approved` : `Vehicle Service ${o.serviceNumber} needs correcting`,
        bodyHtml,
        ctaLabel: 'Open Vehicle Service',
        ctaUrl: o.serviceUrl,
        audience: 'staff',
    });
}
