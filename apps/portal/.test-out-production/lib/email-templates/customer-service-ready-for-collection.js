"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerServiceReadyForCollectionEmail = renderCustomerServiceReadyForCollectionEmail;
const layout_1 = require("./layout");
const ordinal_1 = require("../utils/ordinal");
function renderCustomerServiceReadyForCollectionEmail(o) {
    const reminder = o.reminderNumber ? `${(0, ordinal_1.ordinal)(o.reminderNumber)} reminder` : null;
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`${reminder ? 'A reminder that your' : 'Your'} ${o.vehicleDescription} is ready for collection at ${o.branchName || 'the branch'}. You can collect it any time from now.`)}
    ${(0, layout_1.highlight)('Please collect by', o.dueDate, 'Storage charges may apply if the vehicle stays with us after this date.', 'warning')}
    ${(0, layout_1.details)([
        ['Vehicle Service', o.serviceNumber],
        ['Vehicle', o.vehicleDescription],
        ['Reminder', reminder],
    ])}
    ${(0, layout_1.para)('Please bring a form of identification. If someone else is collecting for you, let the branch know beforehand.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Your ${o.vehicleDescription} is ready. Please collect it by ${o.dueDate}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Ready for collection', tone: 'success' },
        heading: 'Your vehicle is ready for collection',
        bodyHtml,
        ctaLabel: 'View in customer portal',
        ctaUrl: o.dashboardUrl,
        audience: 'customer',
    });
}
