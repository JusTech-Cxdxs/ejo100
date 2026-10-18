"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerApprovalReminderEmail = renderCustomerApprovalReminderEmail;
const layout_1 = require("./layout");
const ordinal_1 = require("../utils/ordinal");
/** The estimate was sent but no deposit has arrived yet. */
function renderCustomerApprovalReminderEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(`The estimate for your ${o.vehicleDescription} is still waiting for your go-ahead. Work starts as soon as the deposit is received, so paying early means your vehicle is ready sooner.`)}
    ${(0, layout_1.highlight)('Please pay by', o.dueDate, 'If something is holding you up, contact the branch and we will work it out with you.', 'warning')}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Vehicle', o.vehicleDescription],
        ['Estimate total', o.totalEstimate],
        [o.depositPercent ? `Deposit to start (${o.depositPercent}%)` : 'Deposit to start', o.minimumDepositAmount],
        ['Reminder', `${(0, ordinal_1.ordinal)(Math.max(1, o.reminderNumber))} reminder`],
    ])}
    ${(0, layout_1.para)('The bank details and payment reference are in the estimate email we sent you, and in your customer portal.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Your estimate for Job Card ${o.jobNumber} is waiting. Please pay the deposit by ${o.dueDate}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Action needed', tone: 'warning' },
        heading: 'Your estimate is waiting for you',
        bodyHtml,
        ctaLabel: 'View estimate',
        ctaUrl: o.dashboardUrl,
        audience: 'customer',
    });
}
