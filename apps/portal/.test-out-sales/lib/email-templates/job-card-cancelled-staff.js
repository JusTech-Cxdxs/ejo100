"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderJobCardCancelledStaffEmail = renderJobCardCancelledStaffEmail;
const layout_1 = require("./layout");
function renderJobCardCancelledStaffEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.approvedByName} approved the cancellation of Job Card ${o.jobNumber} for ${o.customerName}. Stop any work on it; no further work is needed.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['Approved by', o.approvedByName],
    ])}
    ${o.reason?.trim() ? (0, layout_1.callout)(o.reason.trim(), 'neutral', 'Reason') : ''}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Job Card ${o.jobNumber} for ${o.customerName} is cancelled.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Cancelled', tone: 'danger' },
        heading: `Job Card ${o.jobNumber} cancelled`,
        bodyHtml,
        ctaLabel: 'Open Job Card',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
