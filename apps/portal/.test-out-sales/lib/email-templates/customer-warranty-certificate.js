"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerWarrantyCertificateEmail = renderCustomerWarrantyCertificateEmail;
const layout_1 = require("./layout");
function renderCustomerWarrantyCertificateEmail(o) {
    const block = (title, items) => (items.length ? (0, layout_1.html) `${(0, layout_1.sectionTitle)(title)}${(0, layout_1.list)(items)}` : '');
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)('Your warranty is now active. Please keep this email, and quote the warranty number whenever you contact us about it.')}
    ${(0, layout_1.highlight)('Warranty number', o.warrantyNumber, undefined, 'success')}
    ${(0, layout_1.details)([
        ['Covers', o.subject],
        ['Valid from', o.validFrom],
        ['Valid until', o.validUntil],
        ['Provided by', o.providerName],
    ])}
    ${block('What is covered', o.covered)}
    ${block('What is not covered', o.notCovered)}
    ${block('To keep your warranty valid', o.conditions)}
    ${o.isSample ? (0, layout_1.callout)('These are sample terms for demonstration only.', 'warning') : ''}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Warranty ${o.warrantyNumber} for ${o.subject}, valid until ${o.validUntil}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Warranty active', tone: 'success' },
        heading: 'Your warranty certificate',
        bodyHtml,
        audience: 'customer',
    });
}
