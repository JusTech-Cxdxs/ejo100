"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderServiceStoreMatchingRequestedEmail = renderServiceStoreMatchingRequestedEmail;
exports.renderServiceStoreMatchingStatusEmail = renderServiceStoreMatchingStatusEmail;
const layout_1 = require("./layout");
const store_matching_status_1 = require("./store-matching-status");
/** To Store: match Vehicle Service estimate lines to catalogue parts. */
function renderServiceStoreMatchingRequestedEmail(o) {
    const note = o.note?.trim();
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.requestedByName} has asked Store to match ${(0, layout_1.plural)(o.lines.length, 'part')} on the estimate for Vehicle Service ${o.serviceNumber} (${o.customerName}).`)}
    ${(0, layout_1.sectionTitle)('Parts to match')}
    ${(0, store_matching_status_1.storeMatchLines)(o.lines)}
    ${note ? (0, layout_1.callout)(note, 'info', `Note from ${o.requestedByName}`) : ''}
    ${(0, layout_1.para)("Match each line to a catalogue part that fits the vehicle. The price fills in from the part's current selling price.", 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${o.requestedByName} asked Store to match ${(0, layout_1.plural)(o.lines.length, 'part')} for Vehicle Service ${o.serviceNumber}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Matching needed', tone: 'warning' },
        heading: `Match parts for ${o.serviceNumber}`,
        bodyHtml,
        ctaLabel: 'Open estimate matching',
        ctaUrl: o.matchingUrl,
        audience: 'staff',
    });
}
function renderServiceStoreMatchingStatusEmail(o) {
    const awaiting = o.kind === 'awaiting';
    const note = o.note?.trim();
    const line = awaiting
        ? 'The estimate has store part lines waiting to be matched. Store has been told, and the estimate cannot be submitted until matching is done.'
        : 'Store has matched every store part line on the estimate. Pricing is complete and the estimate can be submitted.';
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`Vehicle Service ${o.serviceNumber} for ${o.customerName}: ${line}`)}
    ${note ? (0, layout_1.callout)(note, 'info', 'Note') : ''}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Customer', o.customerName],
    ])}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Vehicle Service ${o.serviceNumber}: ${awaiting ? 'waiting for Store to match parts.' : 'Store matching is complete.'}`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: awaiting ? { label: 'Waiting for Store', tone: 'warning' } : { label: 'Matching complete', tone: 'success' },
        heading: awaiting ? `Waiting for Store to match parts on ${o.serviceNumber}` : `Store matching complete on ${o.serviceNumber}`,
        bodyHtml,
        ctaLabel: 'Open Vehicle Service',
        ctaUrl: o.vehicleServiceUrl,
        audience: 'staff',
    });
}
