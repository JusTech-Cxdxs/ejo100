"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderServiceCloseRequestedEmail = renderServiceCloseRequestedEmail;
const layout_1 = require("./layout");
/** To each workshop manager of the branch when someone asks to close a Vehicle Service. */
function renderServiceCloseRequestedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.managerName)}
    ${(0, layout_1.para)(`${o.requestedByName} has asked to close Vehicle Service ${o.serviceNumber} for ${o.customerName}. Please review the service and approve or decline the request.`)}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
        ['Requested by', o.requestedByName],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.requestedByName} asked to close Vehicle Service ${o.serviceNumber}. Your decision is needed.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Decision needed', tone: 'warning' },
        heading: `Close request for ${o.serviceNumber}`,
        bodyHtml,
        ctaLabel: 'Review request',
        ctaUrl: o.serviceUrl,
        audience: 'staff',
    });
}
