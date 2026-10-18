"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PART_REQUEST_STATUS = void 0;
exports.vehicleSummaryLine = vehicleSummaryLine;
exports.partLines = partLines;
exports.renderPartRequestApprovalNeededEmail = renderPartRequestApprovalNeededEmail;
exports.renderPartRequestStatusEmail = renderPartRequestStatusEmail;
const layout_1 = require("./layout");
function vehicleSummaryLine(vehicle) {
    const parts = [vehicle.year, vehicle.make, vehicle.model, vehicle.engineType].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'No vehicle details on file';
}
function partLines(lines) {
    return (0, layout_1.list)(lines.map((l) => `${l.partName}: ${(0, layout_1.plural)(l.quantity, l.baseUnitOfMeasure)}`));
}
function renderPartRequestApprovalNeededEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.requestedByName} raised store parts request ${o.referenceNumber} for Job Card ${o.jobNumber}. It needs your approval before Store can reserve the parts.`)}
    ${(0, layout_1.details)([
        ['Request', o.referenceNumber],
        ['Job Card', `${o.jobNumber} (${o.customerName})`],
        ['Vehicle', vehicleSummaryLine(o.vehicle)],
        ['Plate', o.vehicle.plateNumber],
        ['VIN / chassis', o.vehicle.chassisNumber],
        ['Requested', `${(0, layout_1.formatEmailDate)(o.requestedAt)} by ${o.requestedByName}`],
    ])}
    ${(0, layout_1.sectionTitle)(`Parts requested (${o.lines.length})`)}
    ${partLines(o.lines)}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.requestedByName} requested ${(0, layout_1.plural)(o.lines.length, 'part')} for ${o.jobNumber}. Your approval is needed.`,
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
exports.PART_REQUEST_STATUS = {
    hod_approved: {
        label: 'Approved by HOD',
        heading: 'Parts request approved by the HOD',
        line: 'was approved by the workshop HOD and is now with Store for approval and stock reservation.',
        tone: 'success',
    },
    store_approved: {
        label: 'Approved by Store',
        heading: 'Parts request approved by Store',
        line: 'was approved by Store. The stock is reserved and ready to be released.',
        tone: 'success',
    },
    released: {
        label: 'Released',
        heading: 'Parts released',
        line: 'has been released by Store. The parts are ready for collection.',
        tone: 'success',
    },
    rejected: {
        label: 'Rejected',
        heading: 'Parts request rejected',
        line: 'was rejected.',
        tone: 'danger',
    },
};
function renderPartRequestStatusEmail(o) {
    const copy = exports.PART_REQUEST_STATUS[o.kind];
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`Store parts request ${o.referenceNumber} for Job Card ${o.jobNumber} (${o.customerName}) ${copy.line}`)}
    ${o.kind === 'rejected' && o.rejectionReason?.trim() ? (0, layout_1.callout)(o.rejectionReason.trim(), 'danger', 'Reason given') : ''}
    ${(0, layout_1.details)([
        ['Request', o.referenceNumber],
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.referenceNumber} for ${o.jobNumber} ${copy.line}`,
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
