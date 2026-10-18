"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderJobCardDecisionEmail = renderJobCardDecisionEmail;
const layout_1 = require("./layout");
/** To whoever opened a Job Card, when the supervisor approves it or returns it for correction. */
function renderJobCardDecisionEmail(o) {
    const approved = o.decision === 'APPROVED';
    const notes = o.notes?.trim();
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${approved
        ? (0, layout_1.para)(`${o.approverName} approved Job Card ${o.jobNumber} for ${o.customerName}. The work can now go ahead.`)
        : (0, layout_1.para)(`${o.approverName} returned Job Card ${o.jobNumber} for ${o.customerName} for correction. Please make the changes below and submit it again.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        [approved ? 'Approved by' : 'Returned by', o.approverName],
    ])}
    ${!approved && o.rejectionReason?.trim() ? (0, layout_1.callout)(o.rejectionReason.trim(), 'danger', 'What needs correcting') : ''}
    ${notes ? (0, layout_1.callout)(notes, 'neutral', 'Notes') : ''}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: approved ? `${o.approverName} approved Job Card ${o.jobNumber}.` : `Job Card ${o.jobNumber} needs correcting before it can go ahead.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: approved ? { label: 'Approved', tone: 'success' } : { label: 'Returned for correction', tone: 'danger' },
        heading: approved ? `Job Card ${o.jobNumber} approved` : `Job Card ${o.jobNumber} needs correcting`,
        bodyHtml,
        ctaLabel: 'Open Job Card',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
