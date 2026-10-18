"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeMatchLines = storeMatchLines;
exports.renderStoreMatchingRequestedEmail = renderStoreMatchingRequestedEmail;
exports.renderStoreMatchingStatusEmail = renderStoreMatchingStatusEmail;
const layout_1 = require("./layout");
function storeMatchLines(lines) {
    return (0, layout_1.list)(lines.map((l) => `${l.description}: ${l.unit ? (0, layout_1.plural)(l.quantity, l.unit) : `quantity ${l.quantity}`}`));
}
/** To Store: match estimate lines to catalogue parts so the estimate can be priced. */
function renderStoreMatchingRequestedEmail(o) {
    const note = o.note?.trim();
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.requestedByName} has asked Store to match ${(0, layout_1.plural)(o.lines.length, 'part')} on the estimate for Job Card ${o.jobNumber} (${o.customerName}).`)}
    ${(0, layout_1.sectionTitle)('Parts to match')}
    ${storeMatchLines(o.lines)}
    ${note ? (0, layout_1.callout)(note, 'info', `Note from ${o.requestedByName}`) : ''}
    ${(0, layout_1.para)('Match each line to a catalogue part that fits the vehicle. The price fills in from the last goods receipt cost.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.requestedByName} asked Store to match ${(0, layout_1.plural)(o.lines.length, 'part')} for Job Card ${o.jobNumber}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: { label: 'Matching needed', tone: 'warning' },
        heading: `Match parts for ${o.jobNumber}`,
        bodyHtml,
        ctaLabel: 'Open estimate matching',
        ctaUrl: o.matchingUrl,
        audience: 'staff',
    });
}
function renderStoreMatchingStatusEmail(o) {
    const awaiting = o.kind === 'awaiting';
    const note = o.note?.trim();
    const line = awaiting
        ? 'The estimate has store part lines waiting to be matched. Store has been told, and the estimate cannot be submitted until matching is done.'
        : 'Store has matched every store part line on the estimate. Pricing is complete and the estimate can be submitted.';
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`Job Card ${o.jobNumber} for ${o.customerName}: ${line}`)}
    ${note ? (0, layout_1.callout)(note, 'info', 'Note') : ''}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Customer', o.customerName],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Job Card ${o.jobNumber}: ${awaiting ? 'waiting for Store to match parts.' : 'Store matching is complete.'}`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: awaiting ? { label: 'Waiting for Store', tone: 'warning' } : { label: 'Matching complete', tone: 'success' },
        heading: awaiting ? `Waiting for Store to match parts on ${o.jobNumber}` : `Store matching complete on ${o.jobNumber}`,
        bodyHtml,
        ctaLabel: 'Open Job Card',
        ctaUrl: o.jobCardUrl,
        audience: 'staff',
    });
}
