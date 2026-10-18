"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderServiceEstimatePartRequestApprovalNeededEmail = renderServiceEstimatePartRequestApprovalNeededEmail;
exports.renderServiceEstimatePartRequestStatusEmail = renderServiceEstimatePartRequestStatusEmail;
const layout_1 = require("./layout");
const part_request_status_1 = require("./part-request-status");
function renderServiceEstimatePartRequestApprovalNeededEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.requestedByName} raised store parts request ${o.referenceNumber} for Vehicle Service ${o.serviceNumber}. It needs your approval before Store can reserve the parts.`)}
    ${(0, layout_1.details)([
        ['Request', o.referenceNumber],
        ['Vehicle Service', `${o.serviceNumber} (${o.customerName})`],
        ['Vehicle', (0, part_request_status_1.vehicleSummaryLine)(o.vehicle)],
        ['Plate', o.vehicle.plateNumber],
        ['VIN / chassis', o.vehicle.chassisNumber],
        ['Requested', `${(0, layout_1.formatEmailDate)(o.requestedAt)} by ${o.requestedByName}`],
    ])}
    ${(0, layout_1.sectionTitle)(`Parts requested (${o.lines.length})`)}
    ${(0, part_request_status_1.partLines)(o.lines)}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.requestedByName} requested ${(0, layout_1.plural)(o.lines.length, 'part')} for ${o.serviceNumber}. Your approval is needed.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Approval needed', tone: 'warning' },
        heading: `Parts request ${o.referenceNumber} needs your approval`,
        bodyHtml,
        ctaLabel: 'Review request',
        ctaUrl: o.approvalUrl,
        audience: 'staff',
    });
}
function renderServiceEstimatePartRequestStatusEmail(o) {
    const copy = part_request_status_1.PART_REQUEST_STATUS[o.kind];
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`Store parts request ${o.referenceNumber} for Vehicle Service ${o.serviceNumber} (${o.customerName}) ${copy.line}`)}
    ${o.kind === 'rejected' && o.rejectionReason?.trim() ? (0, layout_1.callout)(o.rejectionReason.trim(), 'danger', 'Reason given') : ''}
    ${(0, layout_1.details)([
        ['Request', o.referenceNumber],
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.referenceNumber} for ${o.serviceNumber} ${copy.line}`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: copy.label, tone: copy.tone },
        heading: `${copy.heading}: ${o.referenceNumber}`,
        bodyHtml,
        ctaLabel: 'View request',
        ctaUrl: o.requestUrl,
        audience: 'staff',
    });
}
