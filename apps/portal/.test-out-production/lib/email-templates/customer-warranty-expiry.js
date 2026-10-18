"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerWarrantyExpiryEmail = renderCustomerWarrantyExpiryEmail;
const layout_1 = require("./layout");
const ordinal_1 = require("../utils/ordinal");
function renderCustomerWarrantyExpiryEmail(o) {
    const days = `${o.daysLeft} ${o.daysLeft === 1 ? 'day' : 'days'} left`;
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)((0, layout_1.html) `Your warranty ${(0, layout_1.strong)(o.warrantyNumber)} for ${o.subject} ends soon.`)}
    ${(0, layout_1.highlight)('Warranty ends', o.endsOn, o.distanceEnd ? `or at ${o.distanceEnd}, whichever comes first. ${days}.` : `${days}.`, o.isFinal ? 'danger' : 'warning')}
    ${(0, layout_1.para)((0, layout_1.html) `If you have noticed anything unusual, now is the time to have it looked at. We recommend a ${(0, layout_1.strong)('final warranty check')} before the end date, so anything that qualifies can still be handled under the warranty.`)}
    ${(0, layout_1.details)([
        ['Warranty', o.warrantyNumber],
        ['Covers', o.subject],
        ['Reminder', `${(0, ordinal_1.ordinal)(Math.max(1, o.reminderNumber))} reminder`],
    ])}
    ${(0, layout_1.para)('A check does not by itself mean a repair will be covered; that depends on the warranty terms. Contact the branch to book a check.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Warranty ${o.warrantyNumber} ends on ${o.endsOn}. Book a final check before then.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: o.isFinal ? 'Ends in a few days' : 'Ending soon', tone: o.isFinal ? 'danger' : 'warning' },
        heading: o.isFinal ? 'Your warranty ends in a few days' : 'Your warranty ends soon',
        bodyHtml,
        audience: 'customer',
    });
}
