"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerJobWorkUpdateEmail = renderCustomerJobWorkUpdateEmail;
const layout_1 = require("./layout");
/**
 * A work update that says what happened. The rework wording never exposes an
 * internal technician note and never promises a date.
 */
function renderCustomerJobWorkUpdateEmail(o) {
    const resumed = o.kind === 'RESUMED';
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${resumed
        ? (0, layout_1.para)(`The parts we were waiting for have arrived, and work on your ${o.vehicleDescription} has started again.`)
        : (0, layout_1.para)(`During our final checks on your ${o.vehicleDescription}, we found something we want to put right before we hand the vehicle back. It has gone back into the workshop for that work.`)}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Vehicle', o.vehicleDescription],
        ['Status', resumed ? 'Work in progress' : 'Additional work before hand-over'],
    ])}
    ${(0, layout_1.para)(resumed ? 'There is nothing you need to do. We will email you when the vehicle is ready.' : 'There is nothing you need to do. We will email you as soon as the vehicle is ready.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: resumed ? `Work on your ${o.vehicleDescription} has started again.` : `Your ${o.vehicleDescription} needs a little more work before hand-over.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: resumed ? 'Work resumed' : 'Update', tone: 'info' },
        heading: resumed ? 'Work on your vehicle has resumed' : 'An update on your vehicle',
        bodyHtml,
        ctaLabel: 'Follow progress',
        ctaUrl: o.dashboardUrl,
        audience: 'customer',
    });
}
