"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPricingAlertRaisedEmail = renderPricingAlertRaisedEmail;
const layout_1 = require("./layout");
const SEVERITY = {
    CRITICAL_LOSS: {
        label: 'Selling below cost',
        tone: 'danger',
        guidance: 'Each sale at the current price loses money, so this part can no longer be added to new customer estimates. Use Sync price to restore the target margin, or set a new price yourself if the target needs a second look.',
    },
    DEFICIT: {
        label: 'Below target margin',
        tone: 'warning',
        guidance: 'The part still makes a profit, but less than the target. Use Sync price to restore the target margin, or dismiss the alert with a reason if the current price should stay.',
    },
    BOOST: {
        label: 'Above target margin',
        tone: 'success',
        guidance: 'The cost on this delivery went down, so the margin is now above target. You can keep the extra margin or use Sync price to pass some of the saving on. Lowering the price is a business decision, not a correction.',
    },
};
/** Raised when a goods receipt moves a part's margin away from its target. */
function renderPricingAlertRaisedEmail(o) {
    const s = SEVERITY[o.severity];
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`Goods receipt ${o.goodsReceiptReference} changed the cost of ${o.partName}, and its margin is now ${o.actualMarginPercent}% against a target of ${o.targetMarginPercent}%.`)}
    ${(0, layout_1.details)([
        ['Part', o.partName],
        ['Previous cost', o.previousUnitCost],
        ['New cost', o.newUnitCost],
        ['Selling price', o.sellingPrice],
        ['Actual margin', `${o.actualMarginPercent}%`],
        ['Target margin', `${o.targetMarginPercent}%`],
        ['Recommended price', o.recommendedPrice],
        ['Recommended markup', o.recommendedMarkupPercent ? `${o.recommendedMarkupPercent}%` : null],
    ])}
    ${(0, layout_1.callout)(s.guidance, s.tone, 'What to do')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${s.label}: ${o.partName} is at ${o.actualMarginPercent}% margin (target ${o.targetMarginPercent}%).`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: s.label, tone: s.tone },
        heading: `Pricing alert for ${o.partName}`,
        bodyHtml,
        ctaLabel: 'Open Pricing Command Center',
        ctaUrl: o.alertUrl || o.dashboardUrl,
        audience: 'staff',
    });
}
