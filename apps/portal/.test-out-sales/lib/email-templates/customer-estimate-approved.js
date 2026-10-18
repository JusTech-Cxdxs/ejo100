"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerEstimateApprovedEmail = renderCustomerEstimateApprovedEmail;
exports.renderCustomerEstimate = renderCustomerEstimate;
const layout_1 = require("./layout");
const pluralize_1 = require("../utils/pluralize");
/**
 * The estimate as the customer sees it. Internal line types (store part,
 * external job and so on) never appear: lines are listed by description and
 * grouped into three plain subtotals. Payment is by bank transfer or at the
 * cashier, since no payment gateway is connected.
 */
function renderCustomerEstimateApprovedEmail(o) {
    return renderCustomerEstimate({ ...o, recordLabel: 'Job Card', recordNumber: o.jobNumber });
}
/** Shared by the Job Card and Vehicle Service estimate emails. */
function renderCustomerEstimate(o) {
    const vehicle = (0, layout_1.vehicleLabel)(o.vehicleDescription, o.plateNumber);
    const totals = [
        o.servicesSubtotal ? { label: 'Parts and services', amount: o.servicesSubtotal } : null,
        o.labourSubtotal ? { label: 'Labour', amount: o.labourSubtotal } : null,
        o.sundrySubtotal ? { label: 'Sundries', amount: o.sundrySubtotal } : null,
        { label: 'Total', amount: o.totalAmount, emphasis: true },
    ].filter((t) => Boolean(t));
    const depositCaption = o.depositPercent ? `Deposit to start work (${o.depositPercent}%)` : 'Deposit to start work';
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)((0, layout_1.html) `The estimate for your ${vehicle} is ready for you to review. Work starts as soon as we have received the deposit shown below.`)}
    ${(0, layout_1.details)([
        [o.recordLabel, o.recordNumber],
        ['Vehicle', vehicle],
        ['Branch', o.branchName],
    ])}
    ${(0, layout_1.sectionTitle)('Estimate')}
    ${o.lineItems.length
        ? (0, layout_1.moneyTable)(o.lineItems.map((li) => ({
            label: li.description,
            meta: `Quantity ${li.quantity}${li.unitOfMeasure ? ` ${(0, pluralize_1.pluralizeWord)(li.quantity, li.unitOfMeasure)}` : ''}`,
            amount: li.amount,
        })), totals)
        : (0, layout_1.moneyTable)([], totals)}
    ${(0, layout_1.highlight)(depositCaption, o.minimumDepositAmount, 'Pay this amount or more to start the work. The balance is due before collection.', 'warning')}
    ${(0, layout_1.sectionTitle)('How to pay')}
    ${(0, layout_1.para)((0, layout_1.html) `${(0, layout_1.strong)('Bank transfer.')} Use the payment reference below so we can match your payment to this ${o.recordLabel}.`)}
    ${(0, layout_1.details)([
        ['Bank', o.bankName],
        ['Account name', o.accountName],
        ['Account number', o.accountNumber],
        ['Payment reference', o.paymentRemarkSuggestion],
    ])}
    ${(0, layout_1.para)((0, layout_1.html) `${(0, layout_1.strong)('At the branch.')} Pay the cashier at ${o.branchName || 'the branch'}; they will record the payment while you wait.`)}
    ${(0, layout_1.para)('Once a transfer is made, it can take a short while for the branch to confirm it. You will receive an email as soon as your payment is recorded.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Estimate total ${o.totalAmount}. Deposit of ${o.minimumDepositAmount} to start work on your ${vehicle}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Action needed', tone: 'warning' },
        heading: 'Your estimate is ready',
        bodyHtml,
        ctaLabel: 'View estimate',
        ctaUrl: o.dashboardUrl,
        audience: 'customer',
    });
}
