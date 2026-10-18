"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTERNAL_PROCUREMENT_STATUS = void 0;
exports.renderExternalProcurementApprovalNeededEmail = renderExternalProcurementApprovalNeededEmail;
exports.renderExternalProcurementStatusEmail = renderExternalProcurementStatusEmail;
const layout_1 = require("./layout");
function renderExternalProcurementApprovalNeededEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.requestedByName} raised external procurement request ${o.referenceNumber} for Job Card ${o.jobNumber} (${o.customerName}). It needs your approval before it can go ahead.`)}
    ${(0, layout_1.sectionTitle)(`${(0, layout_1.plural)(o.lines.length, 'item')} requested`)}
    ${(0, layout_1.moneyTable)(o.lines.map((l) => ({
        label: l.description,
        meta: l.unitOfMeasure ? (0, layout_1.plural)(l.quantity, l.unitOfMeasure) : `Quantity ${l.quantity}`,
        amount: (0, layout_1.formatNaira)(l.amount),
    })), [{ label: 'Total', amount: (0, layout_1.formatNaira)(o.estimatedAmount), emphasis: true }])}
    ${(0, layout_1.details)([
        ['Request', o.referenceNumber],
        ['Job Card', o.jobNumber],
        ['Requested by', o.requestedByName],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.requestedByName} requested ${(0, layout_1.formatNaira)(o.estimatedAmount)} for ${o.jobNumber}. Your approval is needed.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Approval needed', tone: 'warning' },
        heading: `Procurement request ${o.referenceNumber} needs your approval`,
        bodyHtml,
        ctaLabel: 'Review request',
        ctaUrl: o.approvalUrl,
        audience: 'staff',
    });
}
exports.EXTERNAL_PROCUREMENT_STATUS = {
    sent_to_manager: {
        label: 'With the manager',
        heading: 'Procurement request sent to the manager',
        line: 'passed Finance review and is now with the workshop manager for approval.',
        tone: 'info',
    },
    approved: {
        label: 'Approved',
        heading: 'Procurement request approved',
        line: 'was approved by the manager and is ready for Finance to pay out.',
        tone: 'success',
    },
    disbursed: {
        label: 'Funds paid out',
        heading: 'Procurement funds paid out',
        line: 'has been paid out by Finance. The cash advance is available.',
        tone: 'success',
    },
    rejected: {
        label: 'Rejected',
        heading: 'Procurement request rejected',
        line: 'was rejected.',
        tone: 'danger',
    },
};
function renderExternalProcurementStatusEmail(o) {
    const s = exports.EXTERNAL_PROCUREMENT_STATUS[o.kind];
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`External procurement request ${o.referenceNumber} for Job Card ${o.jobNumber} (${o.customerName}) ${s.line}`)}
    ${o.kind === 'rejected' && o.rejectionReason?.trim() ? (0, layout_1.callout)(o.rejectionReason.trim(), 'danger', 'Reason given') : ''}
    ${(0, layout_1.details)([
        ['Request', o.referenceNumber],
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
        ['Amount', o.amount !== undefined ? (0, layout_1.formatNaira)(o.amount) : null],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.referenceNumber} for ${o.jobNumber} ${s.line}`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: s.label, tone: s.tone },
        heading: `${s.heading}: ${o.referenceNumber}`,
        bodyHtml,
        ctaLabel: 'View request',
        ctaUrl: o.requestUrl,
        audience: 'staff',
    });
}
