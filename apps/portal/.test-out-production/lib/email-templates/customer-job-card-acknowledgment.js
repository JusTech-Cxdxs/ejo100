"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerJobCardAcknowledgmentEmail = renderCustomerJobCardAcknowledgmentEmail;
const layout_1 = require("./layout");
/** The customer's confirmation that the vehicle has been checked in (or that a service became a repair job). */
function renderCustomerJobCardAcknowledgmentEmail(o) {
    const team = o.departmentName ? `our ${o.departmentName} team` : 'our team';
    const escalated = Boolean(o.escalatedFromServiceNumber);
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${escalated
        ? (0, layout_1.para)(`During the routine service on your ${o.vehicleDescription} (Vehicle Service ${o.escalatedFromServiceNumber}), we found work that goes beyond routine maintenance. Your visit now continues as repair Job Card ${o.jobNumber}.`)
        : (0, layout_1.para)(`Thank you for bringing your ${o.vehicleDescription} to ${o.companyName}. We have checked it in at ${o.branchName || 'the branch'}, and ${team} will start the inspection shortly.`)}
    ${escalated ? (0, layout_1.callout)(`Your vehicle stays with us. ${team.charAt(0).toUpperCase()}${team.slice(1)} will prepare an estimate, and no repair work goes ahead until you have approved it.`, 'info') : ''}
    ${(0, layout_1.details)([
        ['Job Card', o.jobNumber],
        ['Vehicle', o.vehicleDescription],
        ['Branch', o.branchName],
    ])}
    ${(0, layout_1.sectionTitle)('What you told us')}
    ${o.complaints.length ? (0, layout_1.list)(o.complaints, true) : (0, layout_1.para)('No specific concerns recorded.', 'small')}
    ${(0, layout_1.para)('We will email you at each step: when the estimate is ready, when work starts and when your vehicle is ready to collect.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: escalated
            ? `Your service continues as repair Job Card ${o.jobNumber}. Nothing is done without your approval.`
            : `Your ${o.vehicleDescription} is checked in under Job Card ${o.jobNumber}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: escalated ? { label: 'Update', tone: 'info' } : { label: 'Checked in', tone: 'success' },
        heading: escalated ? 'Your service now continues as a repair job' : 'We have received your vehicle',
        bodyHtml,
        ctaLabel: 'Follow progress',
        ctaUrl: o.dashboardUrl,
        audience: 'customer',
    });
}
