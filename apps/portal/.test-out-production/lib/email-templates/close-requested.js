"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCloseRequestedEmail = renderCloseRequestedEmail;
const layout_1 = require("./layout");
/** To each workshop manager of the branch when someone asks to close a Job Card. The Job Card itself is unchanged until a manager decides. */
function renderCloseRequestedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.managerName)}
    ${(0, layout_1.para)(`${o.requestedByName} has asked to close Job Card ${o.jobNumber} for ${o.customerName}. Please review the Job Card and approve or decline the request.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['Requested by', o.requestedByName],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.requestedByName} asked to close Job Card ${o.jobNumber}. Your decision is needed.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Decision needed', tone: 'warning' },
        heading: `Close request for ${o.jobNumber}`,
        bodyHtml,
        ctaLabel: 'Review request',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
